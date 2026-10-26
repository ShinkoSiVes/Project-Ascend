import type { ReactNode } from 'react';

interface PixelPanelProps {
  title?: string;
  children: ReactNode;
}

// A bordered box with notched corners, the base container for every screen.
function PixelPanel({ title, children }: PixelPanelProps): React.JSX.Element {
  return (
    <section className="pixel-panel">
      {title && <h2 className="pixel-panel__title">{title}</h2>}
      {children}
    </section>
  );
}

export default PixelPanel;
