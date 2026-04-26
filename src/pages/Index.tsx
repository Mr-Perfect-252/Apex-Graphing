import { useState } from 'react';
import { useGraphingEngine } from '../hooks/useGraphingEngine';
import { GraphCanvas } from '../components/graphing/GraphCanvas';
import { EquationList } from '../components/graphing/EquationList';
import { Button } from '../components/ui/button';
import { Maximize, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from 'lucide-react';

export default function Index() {
  const [showSidebar, setShowSidebar] = useState(true);
  const {
    equations,
    viewWindow,
    userVariables,
    pointsOfInterest,
    addEquation,
    updateEquation,
    updateVariableValue,
    toggleVisibility,
    removeEquation,
    updateColor,
    pan,
    zoom,
    resetView,
    setCanvasSize,
  } = useGraphingEngine();

  const handleZoomIn = () => {
    const centerX = (viewWindow.xMin + viewWindow.xMax) / 2;
    const centerY = (viewWindow.yMin + viewWindow.yMax) / 2;
    zoom(0.8, centerX, centerY);
  };

  const handleZoomOut = () => {
    const centerX = (viewWindow.xMin + viewWindow.xMax) / 2;
    const centerY = (viewWindow.yMin + viewWindow.yMax) / 2;
    zoom(1.2, centerX, centerY);
  };

  const [showPoints, setShowPoints] = useState(true);

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background font-sans relative">
      <div
        className={`transition-all duration-300 ease-in-out h-full flex-shrink-0 overflow-hidden ${
          showSidebar ? 'w-80' : 'w-0'
        }`}
      >
        <div className="w-80 h-full">
          <EquationList
            equations={equations}
            onAdd={addEquation}
            onUpdate={updateEquation}
            onToggleVisibility={toggleVisibility}
            onRemove={removeEquation}
            onUpdateColor={updateColor}
            onUpdateVariableValue={updateVariableValue}
          />
        </div>
      </div>

      <div className="flex-1 relative h-full">
        <div className="absolute top-4 left-4 z-10 flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowSidebar(!showSidebar)}
            className="bg-card/80 backdrop-blur-sm shadow-sm border-border hover:bg-accent"
            title={showSidebar ? 'Hide Equations' : 'Show Equations'}
          >
            {showSidebar ? <ChevronLeft className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
          </Button>
          <Button
            variant={showPoints ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowPoints(!showPoints)}
            className="bg-card/80 backdrop-blur-sm shadow-sm border-border hover:bg-accent text-foreground"
          >
            {showPoints ? 'Hide Points' : 'Show Points'}
          </Button>
        </div>

        <GraphCanvas
          equations={equations}
          viewWindow={viewWindow}
          userVariables={userVariables}
          pointsOfInterest={showPoints ? pointsOfInterest : []}
          onPan={pan}
          onZoom={zoom}
          onResize={setCanvasSize}
        />


        <div className="absolute bottom-6 right-6 flex flex-col gap-2 bg-card/80 backdrop-blur-sm p-2 rounded-xl shadow-lg border border-border">
          <Button variant="ghost" size="icon" onClick={handleZoomIn} title="Zoom In" className="hover:bg-accent">
            <ZoomIn className="w-5 h-5 text-foreground" />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleZoomOut} title="Zoom Out" className="hover:bg-accent">
            <ZoomOut className="w-5 h-5 text-foreground" />
          </Button>
          <Button variant="ghost" size="icon" onClick={resetView} title="Reset View" className="hover:bg-accent">
            <Maximize className="w-5 h-5 text-foreground" />
          </Button>
        </div>
      </div>
    </div>
  );
}
