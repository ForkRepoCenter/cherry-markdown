/**
 * Copyright (C) 2021 Tencent.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// CodeMirror 6 原生类型导入
import { EditorView, ViewUpdate, Rect } from '@codemirror/view';
import { EditorState, SelectionRange } from '@codemirror/state';
import Cherry from '../src/Cherry.js';
import { EditorMode, CherryToolbarsOptions } from './cherry.js';

// 可选依赖的类型声明
declare module '@replit/codemirror-vim' {
  import { Extension } from '@codemirror/state';
  export function vim(): Extension;
}

/**
 * 标记对象接口
 */
export interface TextMarker {
  /** 清除标记 */
  clear(): void;
  /** 查找标记当前位置 */
  find(): { from: number; to: number } | null;
  /** 标记的 CSS 类名 */
  className?: string;
  /** 标记的唯一标识符 */
  markId?: string;
}

/**
 * 标记信息接口
 */
export interface MarkInfo {
  /** 标记起始位置（文档偏移量） */
  from: number;
  /** 标记结束位置（文档偏移量） */
  to: number;
  /** 标记的 CSS 类名 */
  className?: string;
  /** 清除标记的方法 */
  clear?(): void;
}

/**
 * 标记选项接口
 */
export interface MarkTextOptions {
  /** CSS 类名 */
  className?: string;
  /** 鼠标悬停提示文本 */
  title?: string;
  /** 替换元素 */
  replacedWith?: HTMLElement;
  /** 是否原子化（不可分割） */
  atomic?: boolean;
}

/**
 * 搜索游标接口
 */
export interface SearchCursor {
  /** 查找下一个匹配 */
  findNext(): string[] | false;
  /** 查找上一个匹配 */
  findPrevious(): string[] | false;
  /** 获取当前匹配的起始位置 */
  from(): number | null;
  /** 获取当前匹配的结束位置 */
  to(): number | null;
  /** 获取匹配信息 */
  matches(reverse: boolean, startPos: number): { from: number; to: number };
}

/**
 * 滚动信息接口
 */
export interface ScrollInfo {
  /** 水平滚动位置 */
  left: number;
  /** 垂直滚动位置 */
  top: number;
  /** 内容总高度 */
  height: number;
  /** 内容总宽度 */
  width: number;
  /** 可视区域高度 */
  clientHeight: number;
  /** 可视区域宽度 */
  clientWidth: number;
}

/**
 * CodeMirror 6 适配器接口
 * 提供对 EditorView 的封装，使用 CM6 原生类型
 */
export interface CM6Adapter {
  /** 底层 EditorView 实例 */
  view: EditorView;
  /** 事件处理器映射 */
  eventHandlers: Map<string, Array<(...args: unknown[]) => void>>;

  // ==================== 代理属性 ====================
  /** 代理到 view.state - 编辑器状态 */
  readonly state: EditorState;
  /** 代理到 view.scrollDOM - 滚动容器 DOM 元素 */
  readonly scrollDOM: HTMLElement;
  /** 
   * 代理到 view.dispatch - 分发事务，直接透传到 EditorView.dispatch
   * @see https://codemirror.net/docs/ref/#view.EditorView.dispatch
   */
  dispatch(...specs: import('@codemirror/state').TransactionSpec[]): void;
  /** 
   * 代理到 view.requestMeasure - 请求测量，直接透传到 EditorView.requestMeasure
   * @see https://codemirror.net/docs/ref/#view.EditorView.requestMeasure
   */
  requestMeasure(request?: {
    read?: (view: EditorView) => unknown;
    write?: (value: unknown, view: EditorView) => void;
    key?: unknown;
  }): void;
  /** 
   * 代理到 view.posAtCoords - 坐标转位置，直接透传到 EditorView.posAtCoords
   * @see https://codemirror.net/docs/ref/#view.EditorView.posAtCoords
   */
  posAtCoords(coords: { x: number; y: number }, precise?: false): number | null;
  /** 
   * 代理到 view.lineBlockAt - 获取行块信息，直接透传到 EditorView.lineBlockAt
   * @see https://codemirror.net/docs/ref/#view.EditorView.lineBlockAt
   */
  lineBlockAt(pos: number): import('@codemirror/view').BlockInfo;

  // ==================== 基本操作 ====================
  /**
   * 获取编辑器全部内容
   * @returns 文档内容字符串
   */
  getValue(): string;

  /**
   * 设置编辑器内容
   * @param value - 要设置的文本内容
   */
  setValue(value: string): void;

  /**
   * 获取当前选中的文本
   * @returns 选中的文本，如果没有选中则返回空字符串
   */
  getSelection(): string;

  /**
   * 获取所有选区的文本
   * @returns 所有选区文本的数组
   */
  getSelections(): string[];

  /**
   * 替换当前选中的文本
   * @param text - 替换文本
   * @param select - 替换后的选区行为：'around' 选中替换文本，'start' 光标在开头
   */
  replaceSelection(text: string, select?: 'around' | 'start'): void;

  /**
   * 替换多个选区的文本
   * @param texts - 替换文本数组
   * @param select - 替换后的选区行为
   */
  replaceSelections(texts: string[], select?: 'around' | 'start'): void;

  // ==================== 光标和选区操作 ====================
  /**
   * 获取光标位置（文档偏移量）
   * @param type - 'head' 返回光标头部位置，'anchor' 返回锚点位置
   * @returns 光标位置（文档偏移量）
   */
  getCursor(type?: 'head' | 'anchor'): number;

  /**
   * 设置光标位置
   * @param pos - 光标位置（文档偏移量）
   */
  setCursor(pos: number): void;

  /**
   * 设置选区
   * @param anchor - 选区锚点位置（文档偏移量）
   * @param head - 选区头部位置（文档偏移量），不传则与 anchor 相同
   */
  setSelection(anchor: number, head?: number): void;

  /**
   * 获取所有选区
   * @returns CM6 原生 SelectionRange 数组
   */
  listSelections(): readonly SelectionRange[];

  // ==================== 行操作 ====================
  /**
   * 获取指定行的内容
   * @param lineNumber - 行号（1-indexed，与 CM6 一致）
   * @returns 行内容字符串
   */
  getLine(lineNumber: number): string;

  /**
   * 获取文档总行数
   * @returns 行数
   */
  lineCount(): number;

  /**
   * 获取指定范围的文本
   * @param from - 起始位置（文档偏移量）
   * @param to - 结束位置（文档偏移量）
   * @returns 范围内的文本
   */
  getRange(from: number, to: number): string;

  /**
   * 替换指定范围的文本
   * @param text - 替换文本
   * @param from - 起始位置（文档偏移量）
   * @param to - 结束位置（文档偏移量），不传则在 from 位置插入
   */
  replaceRange(text: string, from: number, to?: number): void;

  // ==================== 文档操作 ====================
  /**
   * 获取文档对象（返回自身以保持链式调用）
   * @returns CM6Adapter 实例
   */
  getDoc(): CM6Adapter;

  // ==================== 坐标操作 ====================
  /**
   * 获取指定位置的屏幕坐标
   * @param pos - 文档位置（偏移量），不传则使用当前光标位置
   * @returns 坐标信息，包含 left、top、bottom
   */
  cursorCoords(pos?: number): Rect | null;

  // ==================== 滚动操作 ====================
  /**
   * 滚动到指定位置
   * @param x - 水平滚动位置，null 表示不改变
   * @param y - 垂直滚动位置，null 表示不改变
   */
  scrollTo(x: number | null, y: number | null): void;

  /**
   * 将指定位置滚动到可视区域
   * @param pos - 文档位置（偏移量）
   */
  scrollIntoView(pos: number): void;

  /**
   * 获取滚动信息
   * @returns 滚动信息对象
   */
  getScrollInfo(): ScrollInfo;

  // ==================== DOM 操作 ====================
  /**
   * 获取编辑器包装元素
   * @returns 包装 DOM 元素
   */
  getWrapperElement(): HTMLElement;

  /**
   * 获取滚动容器元素
   * @returns 滚动容器 DOM 元素
   */
  getScrollerElement(): HTMLElement;

  /**
   * 刷新编辑器布局
   */
  refresh(): void;

  /**
   * 聚焦编辑器
   */
  focus(): void;

  // ==================== 选项操作 ====================
  /**
   * 设置编辑器选项
   * @param option - 选项名称
   * @param value - 选项值
   */
  setOption(option: 'value' | 'keyMap' | string, value: string | boolean | object): void;

  /**
   * 获取编辑器选项
   * @param option - 选项名称
   * @returns 选项值
   */
  getOption(option: 'readOnly' | 'disableInput' | 'value' | string): string | boolean | object | null;

  // ==================== 键盘映射 ====================
  /**
   * 设置键盘映射模式
   * @param mode - 键盘映射模式
   */
  setKeyMap(mode: 'sublime' | 'vim'): Promise<void>;

  // ==================== 搜索操作 ====================
  /**
   * 设置搜索查询并高亮匹配
   * @param query - 搜索字符串
   * @param caseSensitive - 是否区分大小写
   * @param isRegex - 是否为正则表达式
   */
  setSearchQuery(query: string, caseSensitive?: boolean, isRegex?: boolean): void;

  /**
   * 清除搜索高亮
   */
  clearSearchQuery(): void;

  // ==================== 标记操作 ====================
  /**
   * 标记指定范围的文本
   * @param from - 起始位置（文档偏移量）
   * @param to - 结束位置（文档偏移量）
   * @param options - 标记选项
   * @returns 标记对象
   */
  markText(from: number, to: number, options: MarkTextOptions): TextMarker;

  /**
   * 查找指定范围内的标记
   * @param from - 起始位置（文档偏移量）
   * @param to - 结束位置（文档偏移量）
   * @returns 标记信息数组
   */
  findMarks(from: number, to: number): MarkInfo[];

  // ==================== 搜索游标 ====================
  /**
   * 获取搜索游标
   * @param query - 搜索字符串或正则表达式
   * @param pos - 起始搜索位置（文档偏移量）
   * @param caseFold - 是否忽略大小写（true 忽略，false 区分）
   * @returns 搜索游标对象
   */
  getSearchCursor(query: string | RegExp, pos?: number, caseFold?: boolean): SearchCursor;

  // ==================== 事件系统 ====================
  /**
   * 添加事件监听器（类型安全版本）
   */
  on<K extends keyof CM6AdapterEventMap>(event: K, handler: CM6AdapterEventMap[K]): void;
  /**
   * 添加事件监听器（通用版本）
   */
  on(event: string, handler: (...args: unknown[]) => void): void;

  /**
   * 移除事件监听器（类型安全版本）
   */
  off<K extends keyof CM6AdapterEventMap>(event: K, handler: CM6AdapterEventMap[K]): void;
  /**
   * 移除事件监听器（通用版本）
   */
  off(event: string, handler: (...args: unknown[]) => void): void;

  /**
   * 触发事件（类型安全版本）
   */
  emit<K extends keyof CM6AdapterEventMap>(event: K, ...args: Parameters<CM6AdapterEventMap[K]>): void;
  /**
   * 触发事件（通用版本）
   */
  emit(event: string, ...args: unknown[]): void;
}

/** CM6Adapter 内部事件映射 */
export interface CM6AdapterEventMap {
  blur: (event: Event) => void;
  focus: (event: Event) => void;
  change: () => void;
  scroll: () => void;
  paste: (event: ClipboardEvent) => void;
  mousedown: (event: MouseEvent) => void;
  keydown: (event: KeyboardEvent) => void;
  keyup: (event: KeyboardEvent) => void;
  cursorActivity: () => void;
  beforeChange: (editor: CM6Adapter) => void;
  drop: (event: DragEvent) => void;
}

/** Editor 配置回调事件映射 */
export interface EditorEventMap {
  onBlur: ViewUpdate;
  onFocus: ViewUpdate;
  onKeydown: KeyboardEvent;
  onPaste: ClipboardEvent;
}

export type EditorEventCallback<K extends keyof EditorEventMap> = (
  event: EditorEventMap[K],
  codemirror: CM6Adapter,
) => void;

export type EditorPasteEventHandler = (
  event: ClipboardEvent,
  clipboardData: ClipboardEvent['clipboardData'],
  codemirror: CM6Adapter,
) => void;

/** 工具栏菜单项配置 */
export interface ToolbarMenuConfig {
  iconName?: string;
  onClick?: () => void;
  [key: string]: string | boolean | number | ((...args: unknown[]) => void) | undefined;
}

/**
 * Cherry 编辑器配置
 */
export interface CherryEditorConfig {
  /** 是否显示行号 */
  lineNumbers?: boolean;
  /** 占位符文本 */
  placeholder?: string;
  /** 是否自动聚焦 */
  autofocus?: boolean;
}

export type EditorConfiguration = {
  /** textarea 的 id 属性值 */
  id?: string;
  /** textarea 的 name 属性值 */
  name?: string;
  /** 是否自动将编辑区的内容回写到 textarea 里 */
  autoSave2Textarea?: boolean;
  /** 编辑器 DOM 容器 */
  editorDom: HTMLElement;
  /** 包装器 DOM 容器 */
  wrapperDom: HTMLElement;
  /** 工具栏配置 */
  toolbars: Record<string, ToolbarMenuConfig | boolean> | CherryToolbarsOptions;
  /** 初始值 */
  value?: string;
  /** 粘贴时是否转换 HTML */
  convertWhenPaste?: boolean;
  /** 快捷键风格，目前仅支持 sublime 和 vim */
  keyMap?: 'sublime' | 'vim';
  /** 初始化后是否保持文档滚动位置 */
  keepDocumentScrollAfterInit?: boolean;
  /** 是否高亮全角符号 ·|￥|、|：|"|"|【|】|（|）|《|》 */
  showFullWidthMark?: boolean;
  /** 是否显示联想框 */
  showSuggestList?: boolean;
  /** CodeMirror 编辑器配置 */
  codemirror: CherryEditorConfig;
  /** 键盘按下回调 */
  onKeydown: EditorEventCallback<'onKeydown'>;
  /** 聚焦回调 */
  onFocus: EditorEventCallback<'onFocus'>;
  /** 失焦回调 */
  onBlur: EditorEventCallback<'onBlur'>;
  /** 粘贴回调 */
  onPaste: EditorEventCallback<'onPaste'>;
  /** 内容变化回调 */
  onChange: (update: ViewUpdate | null, codemirror: CM6Adapter) => void;
  /** 滚动回调 */
  onScroll: (editorView: EditorView) => void;
  /** 粘贴处理函数 */
  handlePaste?: EditorPasteEventHandler;
  /** 预览区域跟随编辑器光标自动滚动 */
  autoScrollByCursor: boolean;
  /** 文件上传回调 */
  fileUpload?: (file: File, callback: (fileUrl: string) => void) => void;
  /** Cherry 实例引用 */
  $cherry?: Cherry;
  /** 书写风格，normal 普通 | typewriter 打字机 | focus 专注，默认 normal */
  writingStyle?: string;
  /** 编辑器初始化后的模式 */
  defaultModel?: EditorMode;
};
