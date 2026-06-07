import { useEffect } from "react";
import splashBg from "../../assets/splash.png";
import lingxiaLogo from "../../assets/lingxia.svg";

interface SplashScreenProps {
  onFinished: () => void;
}

function SplashScreen({ onFinished }: SplashScreenProps): React.JSX.Element {
  useEffect(() => {
    onFinished();
  }, [onFinished]);

  return (
    <div className="splash-screen">
      <img className="splash-bg" src={splashBg} alt="" />
      <div className="splash-brand" aria-label="LINGXIA 企业级员工智能体">
        <img className="splash-brand-icon" src={lingxiaLogo} alt="" />
        <div className="splash-brand-copy">
          <span>LINGXIA</span>
          <small>企业级员工智能体</small>
        </div>
      </div>
    </div>
  );
}

export default SplashScreen;
