import { Euler, Quaternion, Vector3, type Object3D } from 'three';
import type { Pose } from '../AnimationController';
import type { OptionalBone, RequiredBone } from './playerAssets';

/**
 * The procedural fallback for the realistic body, joint by joint.
 *
 * When the model has no clip for something the state machine asks for — a shot, a
 * dive, a pivot — the player must still be seen doing it. The mixer keeps playing the
 * model's locomotion underneath, and this lays the procedural pose's CHANGE over it
 * (`proceduralOverlay`: what the procedural body adds on top of its plain gait), on the
 * model's own bones, found through the skeleton contract's names.
 *
 * Each joint's change is a rotation written in the body's own frame (+Z forward, +Y
 * up), the frame the procedural rig's joints are defined in, and composed the way the
 * rig nests them — a knee's bend follows the hip's swing — so it does not depend on
 * how a particular exporter oriented its bones:
 *
 *   A = G · D · G⁻¹      D the joint's change, G the changes of the joints above it
 *   local' = P⁻¹ · A · P · local      P the parent bone's rotation in the body frame
 *
 * Which of the model's legs and arms is the rig's "L" (the −X side) is measured from
 * the bind pose, never assumed from the names.
 *
 * The bones' own values are saved before the change and put back at the start of the
 * next frame, so nothing accumulates — even on a bone no clip animates. Nothing is
 * allocated per frame. A model missing any of these bones simply goes without that
 * joint's change.
 */

type JointKey =
  | 'spine'
  | 'neck'
  | 'hipL'
  | 'kneeL'
  | 'ankleL'
  | 'hipR'
  | 'kneeR'
  | 'ankleR'
  | 'shoulderL'
  | 'elbowL'
  | 'shoulderR'
  | 'elbowR';

interface Joint {
  key: JointKey;
  bone: Object3D;
  /** Index of the joint whose change this one's axes follow, or −1. */
  parent: number;
  /** This joint's change, and the product of the changes down to and including it. */
  change: Quaternion;
  nested: Quaternion;
  /** The bone's value before this frame's change. */
  saved: Quaternion;
}

type BoneNames = Partial<Record<RequiredBone | OptionalBone, string>>;

const euler = new Euler();
const parentRotation = new Quaternion();
const inverse = new Quaternion();
const applied = new Quaternion();
const scratchA = new Vector3();
const scratchB = new Vector3();

export class ProceduralSkeletonLayer {
  private readonly joints: Joint[] = [];
  private readonly byKey = new Map<JointKey, number>();
  private readonly root: Object3D;
  private readonly model: Object3D;
  private readonly baseY: number;
  private active = false;

  /**
   * `root` is the body's frame (the player group: placed, turned and scaled), `model`
   * its clone of the GLB inside it. Call once, before the root is added to the scene.
   */
  constructor(root: Object3D, model: Object3D, names: BoneNames) {
    this.root = root;
    this.model = model;
    this.baseY = model.position.y;
    root.updateMatrixWorld(true);

    const bone = (name: RequiredBone | OptionalBone): Object3D | null => {
      const actual = names[name];
      return actual ? (model.getObjectByName(actual) ?? null) : null;
    };

    // Which side is which, from where the bones actually are: the rig's "L" is −X.
    const leftLeg = bone('L_UpperLeg');
    const rightLeg = bone('R_UpperLeg');
    let mirrored = false;
    if (leftLeg && rightLeg) {
      leftLeg.getWorldPosition(scratchA);
      rightLeg.getWorldPosition(scratchB);
      root.worldToLocal(scratchA);
      root.worldToLocal(scratchB);
      mirrored = scratchA.x > scratchB.x;
    }
    const side = (left: RequiredBone | OptionalBone, right: RequiredBone | OptionalBone, rig: 'L' | 'R') =>
      bone((rig === 'L') !== mirrored ? left : right);

    // Parents before children, so every joint sees its parent's change already made.
    this.add('spine', bone('Spine'), null);
    this.add('neck', bone('Neck') ?? bone('Head'), 'spine');
    for (const rig of ['L', 'R'] as const) {
      this.add(`hip${rig}`, side('L_UpperLeg', 'R_UpperLeg', rig), null);
      this.add(`knee${rig}`, side('L_LowerLeg', 'R_LowerLeg', rig), `hip${rig}`);
      this.add(`ankle${rig}`, side('L_Foot', 'R_Foot', rig), `knee${rig}`);
      this.add(`shoulder${rig}`, side('L_UpperArm', 'R_UpperArm', rig), 'spine');
      this.add(`elbow${rig}`, side('L_ForeArm', 'R_ForeArm', rig), `shoulder${rig}`);
    }
  }

  /** How many of the rig's joints this model has bones for. */
  get jointCount(): number {
    return this.joints.length;
  }

  /** Whether a change is laid over the bones this frame. */
  get isActive(): boolean {
    return this.active;
  }

  private add(key: JointKey, bone: Object3D | null, parent: JointKey | null): void {
    if (!bone) return;
    this.byKey.set(key, this.joints.length);
    this.joints.push({
      key,
      bone,
      parent: parent === null ? -1 : (this.byKey.get(parent) ?? -1),
      change: new Quaternion(),
      nested: new Quaternion(),
      saved: new Quaternion(),
    });
  }

  /** Puts back what the last change replaced. Call before the mixer poses the bones. */
  restore(): void {
    if (!this.active) return;
    for (const joint of this.joints) joint.bone.quaternion.copy(joint.saved);
    this.model.position.y = this.baseY;
    this.active = false;
  }

  /** Lays `delta` (see `proceduralOverlay`) over the bones as the mixer left them. */
  apply(delta: Pose): void {
    this.restore();
    for (const joint of this.joints) {
      this.changeOf(joint, delta);
      const above = joint.parent >= 0 ? this.joints[joint.parent]!.nested : null;
      joint.nested.copy(joint.change);
      if (above) joint.nested.premultiply(above);

      // A = G · D · G⁻¹, in the body frame.
      applied.copy(joint.change);
      if (above) {
        applied.premultiply(above);
        inverse.copy(above).invert();
        applied.multiply(inverse);
      }
      // local' = P⁻¹ · A · P · local
      this.bodyRotationOf(joint.bone.parent, parentRotation);
      joint.saved.copy(joint.bone.quaternion);
      inverse.copy(parentRotation).invert();
      joint.bone.quaternion.premultiply(parentRotation).premultiply(applied).premultiply(inverse);
    }
    this.model.position.y = this.baseY + delta.rootY;
    this.active = true;
  }

  /** The joint's change as a rotation, the way the stage writes the rig's joints. */
  private changeOf(joint: Joint, d: Pose): void {
    switch (joint.key) {
      case 'spine':
        euler.set(d.spineX, d.twist, d.spineZ);
        break;
      case 'neck':
        euler.set(d.neckX, d.neckY, 0);
        break;
      case 'hipL':
        euler.set(-d.hipL, 0, d.spreadL);
        break;
      case 'hipR':
        euler.set(-d.hipR, 0, d.spreadR);
        break;
      case 'kneeL':
        euler.set(d.kneeL, 0, 0);
        break;
      case 'kneeR':
        euler.set(d.kneeR, 0, 0);
        break;
      case 'ankleL':
        euler.set(d.ankleL, 0, 0);
        break;
      case 'ankleR':
        euler.set(d.ankleR, 0, 0);
        break;
      case 'shoulderL':
        euler.set(-d.shoulderL, 0, -d.armOutL);
        break;
      case 'shoulderR':
        euler.set(-d.shoulderR, 0, d.armOutR);
        break;
      case 'elbowL':
        euler.set(-d.elbowL, 0, 0);
        break;
      case 'elbowR':
        euler.set(-d.elbowR, 0, 0);
        break;
    }
    joint.change.setFromEuler(euler);
  }

  /** A node's rotation in the body frame: its local rotations multiplied up to the root. */
  private bodyRotationOf(node: Object3D | null, out: Quaternion): Quaternion {
    out.identity();
    let current = node;
    while (current && current !== this.root) {
      out.premultiply(current.quaternion);
      current = current.parent;
    }
    return out;
  }
}
