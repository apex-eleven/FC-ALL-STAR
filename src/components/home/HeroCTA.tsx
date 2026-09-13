import GradientButton from '@/components/ui/GradientButton';
import styles from './HeroCTA.module.css';

export interface HeroCTAProps {
  label: string;
  onClick?: () => void;
}

export default function HeroCTA({ label, onClick }: HeroCTAProps) {
  return (
    <div className={styles.cta}>
      <GradientButton fontSize={36} onClick={onClick}>
        {label}
      </GradientButton>
    </div>
  );
}
