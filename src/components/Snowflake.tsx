interface SnowflakeProps {
  left: number;
  delay: number;
  duration: number;
  size: number;
}

export const Snowflake = ({ left, delay, duration, size }: SnowflakeProps) => {
  return (
    <div
      className="snowflake"
      style={{
        left: `${left}%`,
        width: `${size}px`,
        height: `${size}px`,
        animationDelay: `${delay}s`,
        animationDuration: `${duration}s`,
      }}
    />
  );
};