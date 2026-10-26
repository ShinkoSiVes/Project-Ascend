import PixelBar from './components/PixelBar';
import PixelButton from './components/PixelButton';
import PixelPanel from './components/PixelPanel';
import Versions from './components/Versions';

function App(): React.JSX.Element {
  return (
    <>
      <PixelPanel title="Project: Ascend">
        <p>Scaffold ready. The dashboard comes next.</p>
      </PixelPanel>

      {/* Temporary preview of the base components; the dashboard replaces it. */}
      <PixelPanel title="Theme preview">
        <div className="pixel-stack">
          <PixelBar label="HP" value={7} max={10} kind="hp" />
          <PixelBar label="XP" value={42} max={100} kind="xp" />
          <div className="pixel-row">
            <PixelButton variant="primary">Start</PixelButton>
            <PixelButton>Options</PixelButton>
            <PixelButton variant="danger">Quit</PixelButton>
            <PixelButton disabled>Locked</PixelButton>
          </div>
        </div>
      </PixelPanel>

      <Versions></Versions>
    </>
  );
}

export default App;
