// Messages sent over the WebSocket, as JSON

export interface ProjectFile {
  path: string;
  content: string;
}

// Browser -> terminal service
export type ClientMessage =
  | { type: 'init'; files: ProjectFile[]; cols: number; rows: number } // must be the first message
  | { type: 'input'; data: string } // keystrokes
  | { type: 'resize'; cols: number; rows: number }
  // Editor changes; seq numbers them so the browser can ignore scans taken before a change was applied
  | { type: 'sync'; files: ProjectFile[]; folders?: string[]; seq?: number } // edited files, new folders
  | { type: 'delete'; paths: string[]; seq?: number } // files or folders deleted (or renamed) in the editor
  | { type: 'pull' }; // ask for the workspace files right now

// Terminal service -> browser
export type ServerMessage =
  | { type: 'ready' }
  | { type: 'output'; data: string }
  // All files in the workspace; sent automatically whenever something changed.
  // seq: the last editor change that was applied when the scan started.
  | { type: 'files'; files: ProjectFile[]; folders: string[]; skipped: string[]; seq: number }
  | { type: 'error'; message: string }
  | { type: 'exit'; reason: string }; // the session is over
