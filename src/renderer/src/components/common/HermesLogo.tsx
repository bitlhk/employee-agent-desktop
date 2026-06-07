import lingxiaLogo from "../../assets/lingxia.svg";

function HermesLogo({ size = 32 }: { size?: number }): React.JSX.Element {
  return (
    <img
      src={lingxiaLogo}
      width={size}
      height={size}
      className="lingxia-logo"
      alt="灵犀员工智能体"
    />
  );
}

export default HermesLogo;
