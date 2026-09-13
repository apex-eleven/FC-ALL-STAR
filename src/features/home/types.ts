
export interface HeroContent {
  title: string;
  subtitle?: string;
  ctaLabel: string;
  /** Number of promo slides the hero cycles through. */
  slideCount: number;
  activeSlide: number;
}

export interface ClubSummary {
  name: string;
  /** Live squad rating, shown on the OVR badge. */
  overallRating: number;
  /** Full-card background. Composed art — the card adds only a text scrim. */
  background: string;
}

export interface PlayCardContent {
  label: string;
  background: string;
}

/**
 * How a piece of key art is fitted to the 2048x942 stage.
 *
 * The art is 4:3 and the stage is 2.17:1, so it is used twice: once blurred and
 * cropped to cover the whole stage (the wash), and once as a sharp window over the
 * figures (the focus). Everything is in design pixels, so a new image only needs
 * these numbers changed — no CSS edits.
 */
export interface HeroBackdrop {
  source: string;

  /** Sharp layer. */
  focus: {
    /** Window on the stage. */
    left: number;
    top: number;
    width: number;
    height: number;
    /** The full art, scaled. artWidth / naturalWidth is the scale factor. */
    artWidth: number;
    artHeight: number;
    /** Art offset inside the window; negative values crop from the left/top. */
    artOffsetX: number;
    artOffsetY: number;
    /** Soft edges so the crop does not show a hard seam. CSS gradient stops. */
    fadeLeft: string;
    fadeRight: string;
  };

  /** Blurred full-frame layer behind everything. */
  wash: {
    objectPosition: string;
    blur: number;
    brightness: number;
    saturate: number;
    opacity: number;
  };
}
