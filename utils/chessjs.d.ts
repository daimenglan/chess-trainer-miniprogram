/**
 * chess.js 类型声明
 * 基于 utils/chessjs.js 的导出接口
 */

export type Color = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type Square = string;

export const WHITE: Color;
export const BLACK: Color;
export const PAWN: PieceType;
export const KNIGHT: PieceType;
export const BISHOP: PieceType;
export const ROOK: PieceType;
export const QUEEN: PieceType;
export const KING: PieceType;
export const DEFAULT_POSITION: string;
export const SQUARES: string[];

export interface Piece {
  type: PieceType;
  color: Color;
}

export interface Move {
  color: Color;
  from: Square;
  to: Square;
  piece: PieceType;
  captured?: PieceType;
  promotion?: PieceType;
  flags: string;
  san: string;
  lan: string;
  before: string;
  after: string;
}

export interface ValidateFenResult {
  ok: boolean;
  error?: string;
}

export function validateFen(fen: string): ValidateFenResult;

export class Chess {
  constructor(fen?: string);

  clear(preserveHeaders?: boolean): void;
  removeHeader(key: string): void;
  load(fen: string, options?: { skipValidation?: boolean; preserveHeaders?: boolean }): void;
  fen(): string;
  reset(): void;
  get(square: Square): Piece | false;
  put(piece: { type: PieceType; color: Color }, square: Square): boolean;
  remove(square: Square): Piece | false;
  isAttacked(square: Square, attackedBy: Color): boolean;
  isCheck(): boolean;
  inCheck(): boolean;
  isCheckmate(): boolean;
  isStalemate(): boolean;
  isInsufficientMaterial(): boolean;
  isThreefoldRepetition(): boolean;
  isDraw(): boolean;
  isGameOver(): boolean;
  moves(options?: { verbose?: boolean; square?: Square; piece?: PieceType }): string[] | Move[];
  move(move: string | { from: Square; to: Square; promotion?: PieceType }, options?: { strict?: boolean }): Move;
  undo(): Move | null;
  pgn(options?: { newline?: string; maxWidth?: number }): string;
  header(...args: string[]): { [key: string]: string };
  loadPgn(pgn: string, options?: { strict?: boolean; newlineChar?: string }): void;
  board(): (Piece | null)[][];
  history(options?: { verbose?: boolean }): string[] | Move[];
  turn(): Color;
  moveNumber(): number;
  ascii(): string;
  perft(depth: number): number;
  squareColor(square: Square): 'light' | 'dark' | null;
  getComment(): string | undefined;
  setComment(comment: string): void;
  deleteComment(): string | undefined;
  getComments(): { fen: string; comment: string }[];
  deleteComments(): { fen: string; comment: string }[];
  setCastlingRights(color: Color, rights: { [KING]?: boolean; [QUEEN]?: boolean }): boolean;
  getCastlingRights(color: Color): { [KING]: boolean; [QUEEN]: boolean };
}