interface IceHoleProps {
  left: number;
}

export const IceHole = ({ left }: IceHoleProps) => {
  return <div className="ice-hole" style={{ left: `${left}px` }} />;
};