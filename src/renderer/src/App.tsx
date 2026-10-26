import Versions from './components/Versions';

function App(): React.JSX.Element {
  return (
    <>
      <div className="text">
        <span className="react">Project: Ascend</span>
      </div>
      <p className="tip">Scaffold ready. The dashboard comes next.</p>
      <Versions></Versions>
    </>
  );
}

export default App;
