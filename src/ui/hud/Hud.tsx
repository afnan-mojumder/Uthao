import { render } from 'preact';

export interface HudState {
  speedKmh: number;
  objectiveText: string;
  statusText?: string;
  fare?: number;
}

export function HudView({ state }: { state: HudState }) {
  return (
    <div
      id="hud"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '24px',
        boxSizing: 'border-box',
        fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      {/* Top Objective Bar */}
      <div
        style={{
          alignSelf: 'center',
          background: 'rgba(15, 23, 42, 0.85)',
          border: '1px solid #10b981',
          borderRadius: '10px',
          padding: '10px 28px',
          color: '#ffffff',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6)',
          textAlign: 'center',
          backdropFilter: 'blur(4px)',
        }}
      >
        <div
          style={{
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '1.5px',
            color: '#10b981',
            fontWeight: 700,
            marginBottom: '4px',
          }}
        >
          Objective
        </div>
        <div id="hud-objective" style={{ fontSize: '18px', fontWeight: 600 }}>
          {state.objectiveText}
        </div>
        {state.fare !== undefined && (
          <div style={{ fontSize: '14px', color: '#fbbf24', marginTop: '2px' }}>
            Fare: ৳{state.fare}
          </div>
        )}
      </div>

      {/* Bottom Speedometer */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'flex-end',
        }}
      >
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.85)',
            border: '1px solid #334155',
            borderRadius: '12px',
            padding: '12px 24px',
            color: '#ffffff',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6)',
            textAlign: 'right',
            minWidth: '110px',
            backdropFilter: 'blur(4px)',
          }}
        >
          <div
            id="hud-speed"
            style={{
              fontSize: '38px',
              fontWeight: 800,
              lineHeight: 1,
              color: '#ffffff',
            }}
          >
            {Math.round(state.speedKmh)}
          </div>
          <div
            style={{
              fontSize: '11px',
              letterSpacing: '1.2px',
              color: '#94a3b8',
              fontWeight: 600,
              marginTop: '4px',
            }}
          >
            KM / H
          </div>
        </div>
      </div>
    </div>
  );
}

export class Hud {
  private container: HTMLDivElement;
  private state: HudState = {
    speedKmh: 0,
    objectiveText: 'Waiting for ride requests...',
  };

  constructor(parent: HTMLElement = document.body) {
    this.container = document.createElement('div');
    this.container.id = 'hud-root';
    parent.appendChild(this.container);
    this.render();
  }

  update(state: Partial<HudState>): void {
    this.state = { ...this.state, ...state };
    this.render();
  }

  private render(): void {
    render(<HudView state={this.state} />, this.container);
  }

  destroy(): void {
    render(null, this.container);
    this.container.remove();
  }
}
