import { Chess } from 'chess.js';
import { fenTurn } from '../lib/chess';

// Stockfish (lite, single-threaded WASM) driven over UCI in a Web Worker.

export interface EngineLine {
  multipv: number;
  depth: number;
  /** Centipawns from White's point of view. */
  cp?: number;
  /** Moves to mate from White's point of view (positive: White mates). */
  mate?: number;
  pv: string[];
}

export interface EngineResult {
  fen: string;
  depth: number;
  lines: EngineLine[];
  done: boolean;
  cancelled?: boolean;
}

export interface SearchOptions {
  multiPv: number;
  depth: number;
}

interface Job {
  fen: string;
  opts: SearchOptions;
  onUpdate?: (r: EngineResult) => void;
  resolve: (r: EngineResult) => void;
  result: EngineResult;
  cancelled: boolean;
  lastEmit: number;
  /** Lines of the depth being searched, published once every PV of that depth arrived. */
  pending: EngineLine[];
  pendingDepth: number;
  expected: number;
}

export class Engine {
  private worker: Worker;
  private ready = false;
  private job: Job | null = null;
  private queue: Job[] = [];
  private multiPv = 1;
  error: string | null = null;

  constructor(hashMb = 32) {
    this.worker = new Worker(`${import.meta.env.BASE_URL}engine/stockfish.js`);
    this.worker.onmessage = (e) => this.onLine(String(e.data), hashMb);
    this.worker.onerror = () => {
      this.error = 'Impossible de charger Stockfish.';
      this.flush(true);
    };
    this.send('uci');
  }

  private send(cmd: string) {
    this.worker.postMessage(cmd);
  }

  private onLine(line: string, hashMb: number) {
    if (line === 'uciok') {
      this.send(`setoption name Hash value ${hashMb}`);
      this.send('isready');
    } else if (line === 'readyok') {
      if (!this.ready) {
        this.ready = true;
        this.pump();
      }
    } else if (line.startsWith('info ') && this.job) {
      this.parseInfo(line, this.job);
    } else if (line.startsWith('bestmove')) {
      const job = this.job;
      this.job = null;
      if (job) {
        job.result.done = true;
        job.result.cancelled = job.cancelled;
        job.onUpdate?.(job.result);
        job.resolve(job.result);
      }
      this.pump();
    }
  }

  private parseInfo(line: string, job: Job) {
    const t = line.split(' ');
    const depthAt = t.indexOf('depth');
    const scoreAt = t.indexOf('score');
    const pvAt = t.indexOf('pv');
    if (depthAt < 0 || scoreAt < 0 || pvAt < 0) return;
    if (t[scoreAt + 3] === 'lowerbound' || t[scoreAt + 3] === 'upperbound') return;
    const mpAt = t.indexOf('multipv');
    const multipv = mpAt >= 0 ? Number(t[mpAt + 1]) : 1;
    const sign = fenTurn(job.fen) === 'white' ? 1 : -1;
    const value = Number(t[scoreAt + 2]) * sign;
    const l: EngineLine = { multipv, depth: Number(t[depthAt + 1]), pv: t.slice(pvAt + 1) };
    if (t[scoreAt + 1] === 'mate') l.mate = value;
    else l.cp = value;
    if (l.depth !== job.pendingDepth) {
      job.pendingDepth = l.depth;
      job.pending = [];
    }
    job.pending[multipv - 1] = l;
    if (job.pending.filter(Boolean).length < job.expected) return;
    job.result.lines = [...job.pending];
    job.result.depth = l.depth;
    const now = performance.now();
    if (now - job.lastEmit > 120) {
      job.lastEmit = now;
      job.onUpdate?.({ ...job.result, lines: [...job.result.lines] });
    }
  }

  private pump() {
    if (!this.ready || this.job) return;
    const job = this.queue.shift();
    if (!job) return;
    this.job = job;
    if (job.opts.multiPv !== this.multiPv) {
      this.multiPv = job.opts.multiPv;
      this.send(`setoption name MultiPV value ${this.multiPv}`);
    }
    this.send(`position fen ${job.fen}`);
    this.send(`go depth ${job.opts.depth}`);
  }

  private flush(includeCurrent: boolean) {
    for (const j of this.queue) {
      j.result.cancelled = true;
      j.resolve(j.result);
    }
    this.queue = [];
    if (includeCurrent && this.job) {
      this.job.cancelled = true;
      if (this.error) {
        this.job.resolve(this.job.result);
        this.job = null;
      }
    }
  }

  /** Queues a search; resolves with the final lines. */
  analyze(fen: string, opts: SearchOptions, onUpdate?: (r: EngineResult) => void): Promise<EngineResult> {
    return new Promise((resolve) => {
      const result: EngineResult = { fen, depth: 0, lines: [], done: false };
      if (this.error) return resolve({ ...result, cancelled: true });
      const expected = Math.max(1, Math.min(opts.multiPv, new Chess(fen).moves().length));
      this.queue.push({ fen, opts, onUpdate, resolve, result, cancelled: false, lastEmit: 0, pending: [], pendingDepth: 0, expected });
      this.pump();
    });
  }

  /** Drops everything pending and searches this position as soon as the engine is free. */
  analyzeNow(fen: string, opts: SearchOptions, onUpdate?: (r: EngineResult) => void): Promise<EngineResult> {
    this.stop();
    return this.analyze(fen, opts, onUpdate);
  }

  stop() {
    this.flush(true);
    if (this.job) this.send('stop');
  }

  terminate() {
    this.error ??= 'Moteur arrêté.';
    this.flush(true);
    this.worker.terminate();
  }
}

let shared: Engine | null = null;

/** Engine used by the interactive board. Batch analysis creates its own instance. */
export function sharedEngine(): Engine {
  return (shared ??= new Engine());
}

export function stopSharedEngine() {
  shared?.stop();
}
