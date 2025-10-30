import { ConnectButton } from '@rainbow-me/rainbowkit';
import '../styles/Header.css';

export function Header() {
  return (
    <header className="header">
      <div className="header-container">
        <div className="header-content">
          <div className="header-left">
            <h1 className="header-title">Privacy Paradox</h1>
            <p className="header-subtitle">Encrypted Twenty One on Zama FHE</p>
          </div>
          <ConnectButton label="Connect Wallet" />
        </div>
      </div>
    </header>
  );
}
