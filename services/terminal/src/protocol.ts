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
  | { type: 'sync'; files: ProjectFile[] } // push edited files into the workspace
  | { type: 'pull' }; // read files back from the workspace

// Terminal service -> browser
export type ServerMessage =
  | { type: 'ready' }
  | { type: 'output'; data: string }
  | { type: 'files'; files: ProjectFile[]; folders: string[]; skipped: string[] }
  | { type: 'error'; message: string }
  | { type: 'exit'; reason: string }; // the session is over
