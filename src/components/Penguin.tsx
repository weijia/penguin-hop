interface PenguinProps {
  left: number;
  bottom: number;
  isJumping: boolean;
}

export const Penguin = ({ left, bottom, isJumping }: PenguinProps) => {
  return (
    <div
      className="penguin"
      style={{
        left: `${left}px`,
        bottom: `${bottom}px`,
        transform: isJumping ? 'translateX(-50%) scale(1.1)' : 'translateX(-50%)',
        transition: 'transform 0.1s ease-out',
      }}
    >
      <div className="penguin-head">
        <div className="penguin-face">
          <div className="penguin-eye left" />
          <div className="penguin-eye right" />
        </div>
        <div className="penguin-beak" />
      </div>
      <div className="penguin-body">
        <div className="penguin-arm left" />
        <div className="penguin-arm right" />
        <div className="penguin-foot left" />
        <div className="penguin-foot right" />
      </div>
    </div>
  );
};