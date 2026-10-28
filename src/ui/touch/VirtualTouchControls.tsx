import type { JSX } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import type { InputManager } from '../../input/InputManager';

interface VirtualTouchProps {
  inputManager?: InputManager;
  onHorn?: () => void;
}

export function VirtualTouchControls({ inputManager, onHorn }: VirtualTouchProps): JSX.Element | null {
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth <= 960;
    setIsTouchDevice(hasTouch);

    const handleResize = () => {
      setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth <= 960);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!isTouchDevice) return null;

  const getInput = (): InputManager | undefined => {
    if (inputManager) return inputManager;
    if (typeof window !== 'undefined') {
      return (window as unknown as { __uthaoInput?: InputManager }).__uthaoInput;
    }
    return undefined;
  };

  const handleSteerLeft = (pressed: boolean) => {
    getInput()?.setRawKeyboardState({ steerLeft: pressed });
  };

  const handleSteerRight = (pressed: boolean) => {
    getInput()?.setRawKeyboardState({ steerRight: pressed });
  };

  const handleThrottle = (pressed: boolean) => {
    getInput()?.setRawKeyboardState({ throttle: pressed });
  };

  const handleBrake = (pressed: boolean) => {
    getInput()?.setRawKeyboardState({ brake: pressed });
  };

  const buttonStyle: Record<string, string | number> = {
    userSelect: 'none',
    touchAction: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(15, 23, 42, 0.78)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid rgba(255, 255, 255, 0.18)',
    borderRadius: '16px',
    color: '#ffffff',
    fontSize: '20px',
    fontWeight: 700,
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
    pointerEvents: 'auto',
    cursor: 'pointer',
  };

  return (
    <div
      id="uthao-touch-controls"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        padding: '24px 28px',
        zIndex: 40,
      }}
    >
      {/* Left Hand: Steering Paddles */}
      <div style={{ display: 'flex', gap: '14px', pointerEvents: 'auto', marginBottom: '140px' }}>
        <button
          type="button"
          onPointerDown={() => handleSteerLeft(true)}
          onPointerUp={() => handleSteerLeft(false)}
          onPointerCancel={() => handleSteerLeft(false)}
          style={{
            ...buttonStyle,
            width: '64px',
            height: '64px',
          }}
          title="Steer Left"
        >
          ◀
        </button>

        <button
          type="button"
          onPointerDown={() => handleSteerRight(true)}
          onPointerUp={() => handleSteerRight(false)}
          onPointerCancel={() => handleSteerRight(false)}
          style={{
            ...buttonStyle,
            width: '64px',
            height: '64px',
          }}
          title="Steer Right"
        >
          ▶
        </button>
      </div>

      {/* Right Hand: Throttle & Brake Pedals + Horn */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '14px', pointerEvents: 'auto', marginBottom: '140px' }}>
        {/* Quick Horn */}
        <button
          type="button"
          onClick={onHorn}
          style={{
            ...buttonStyle,
            width: '52px',
            height: '52px',
            borderRadius: '50%',
            borderColor: '#f59e0b',
            color: '#f59e0b',
            fontSize: '18px',
          }}
          title="Honk Horn"
        >
          📢
        </button>

        <div style={{ display: 'flex', gap: '14px' }}>
          <button
            type="button"
            onPointerDown={() => handleBrake(true)}
            onPointerUp={() => handleBrake(false)}
            onPointerCancel={() => handleBrake(false)}
            style={{
              ...buttonStyle,
              width: '64px',
              height: '74px',
              borderColor: 'rgba(239, 68, 68, 0.5)',
              color: '#ef4444',
              flexDirection: 'column',
              fontSize: '13px',
              gap: '4px',
            }}
            title="Brake / Reverse"
          >
            <span style={{ fontSize: '18px' }}>▼</span>
            <span>BRAKE</span>
          </button>

          <button
            type="button"
            onPointerDown={() => handleThrottle(true)}
            onPointerUp={() => handleThrottle(false)}
            onPointerCancel={() => handleThrottle(false)}
            style={{
              ...buttonStyle,
              width: '74px',
              height: '84px',
              borderColor: 'rgba(34, 197, 94, 0.6)',
              color: '#22c55e',
              flexDirection: 'column',
              fontSize: '13px',
              gap: '4px',
            }}
            title="Throttle / Accelerate"
          >
            <span style={{ fontSize: '20px' }}>▲</span>
            <span>GO</span>
          </button>
        </div>
      </div>
    </div>
  );
}
