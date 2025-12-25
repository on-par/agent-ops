import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { Loader2, AlertCircle } from 'lucide-react';
import { useContainerTerminal } from '../../hooks/use-container-terminal';
import '@xterm/xterm/css/xterm.css';

interface ContainerTerminalProps {
  containerId: string;
}

/**
 * ContainerTerminal component provides an interactive terminal interface
 * for executing commands in a container
 *
 * Features:
 * - Full xterm.js terminal emulation
 * - WebSocket-based real-time communication
 * - Automatic resizing with container
 * - Reconnection handling
 */
export function ContainerTerminal({ containerId }: ContainerTerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  const { status, send, resize, onData } = useContainerTerminal(containerId, {
    initialSize: { rows: 24, cols: 80 },
  });

  // Initialize xterm.js terminal
  useEffect(() => {
    if (!terminalRef.current) return;

    // Create terminal instance
    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#0a0a0a',
        foreground: '#e5e7eb',
        cursor: '#60a5fa',
        selectionBackground: '#374151',
        black: '#1f2937',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#d1d5db',
        brightBlack: '#6b7280',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#f3f4f6',
      },
      allowProposedApi: true,
    });

    // Create and load fit addon
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    // Open terminal in the container
    terminal.open(terminalRef.current);

    // Fit terminal to container size
    try {
      fitAddon.fit();
    } catch (error) {
      console.error('Failed to fit terminal:', error);
    }

    // Store refs
    xtermRef.current = terminal;
    fitAddonRef.current = fitAddon;
    setIsInitialized(true);

    // Handle terminal input
    terminal.onData((data) => {
      send(data);
    });

    // Cleanup on unmount
    return () => {
      terminal.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      setIsInitialized(false);
    };
  }, [send]);

  // Handle data from WebSocket
  useEffect(() => {
    if (!isInitialized) return;

    return onData((data) => {
      xtermRef.current?.write(data);
    });
  }, [onData, isInitialized]);

  // Send resize events to backend
  useEffect(() => {
    if (!isInitialized || !fitAddonRef.current || !xtermRef.current) return;

    const terminal = xtermRef.current;

    const handleResize = () => {
      resize({
        rows: terminal.rows,
        cols: terminal.cols,
      });
    };

    // Listen for terminal resize events
    const resizeDisposable = terminal.onResize(handleResize);

    return () => {
      resizeDisposable.dispose();
    };
  }, [resize, isInitialized]);

  // Handle window resize
  useEffect(() => {
    if (!isInitialized || !fitAddonRef.current) return;

    const fitAddon = fitAddonRef.current;

    const handleWindowResize = () => {
      try {
        fitAddon.fit();
      } catch (error) {
        console.error('Failed to fit terminal on window resize:', error);
      }
    };

    window.addEventListener('resize', handleWindowResize);

    return () => {
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [isInitialized]);

  // Display connection status
  useEffect(() => {
    if (!xtermRef.current) return;

    const terminal = xtermRef.current;

    if (status === 'connecting') {
      terminal.writeln('\r\n\x1b[1;33mConnecting to container terminal...\x1b[0m');
    } else if (status === 'connected') {
      terminal.writeln('\r\n\x1b[1;32mConnected to container terminal.\x1b[0m');
      terminal.writeln('\x1b[1;32mType commands and press Enter to execute.\x1b[0m\r\n');
    } else if (status === 'error') {
      terminal.writeln('\r\n\x1b[1;31mConnection error. Retrying...\x1b[0m');
    } else if (status === 'disconnected') {
      terminal.writeln('\r\n\x1b[1;31mDisconnected from container terminal.\x1b[0m');
    }
  }, [status]);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a]">
      {/* Status bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-[var(--border)] bg-[var(--bg-subtle)]">
        {status === 'connecting' && (
          <>
            <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
            <span className="text-xs text-[var(--text-muted)]">Connecting to terminal...</span>
          </>
        )}
        {status === 'connected' && (
          <>
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs text-green-400">Terminal connected</span>
          </>
        )}
        {status === 'error' && (
          <>
            <AlertCircle className="w-4 h-4 text-red-400" />
            <span className="text-xs text-red-400">Connection error</span>
          </>
        )}
        {status === 'disconnected' && (
          <>
            <div className="w-2 h-2 rounded-full bg-gray-400" />
            <span className="text-xs text-[var(--text-muted)]">Disconnected</span>
          </>
        )}
      </div>

      {/* Terminal container */}
      <div ref={terminalRef} className="flex-1 p-2 overflow-hidden" />
    </div>
  );
}
