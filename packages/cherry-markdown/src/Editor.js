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
// @ts-check
import { EditorView, keymap, placeholder, lineNumbers, Decoration, WidgetType, drawSelection } from '@codemirror/view';
import { EditorState, StateEffect, StateField, EditorSelection, Transaction, Compartment } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { search, searchKeymap, SearchQuery } from '@codemirror/search';
import { history, historyKeymap, defaultKeymap, indentWithTab } from '@codemirror/commands';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import htmlParser from '@/utils/htmlparser';
import pasteHelper from '@/utils/pasteHelper';
import Logger from '@/Logger';
import { handleFileUploadCallback } from '@/utils/file';
import { tagHighlighter, tags } from '@lezer/highlight';
import { createElement } from './utils/dom';
import { longTextReg, base64Reg, imgDrawioXmlReg, createUrlReg } from './utils/regexp';
import { addEvent } from './utils/event';
import { handleNewlineIndentList } from './utils/autoindent';

/**
 * 自定义语法高亮器 - 将 Lezer tags 映射为 cm-* 类名
 * 用于保持样式兼容性
 */
const cherryHighlighter = tagHighlighter([
  // 字符串相关
  { tag: tags.string, class: 'cm-string' },
  { tag: tags.special(tags.string), class: 'cm-string-2' },

  // 数字
  { tag: tags.number, class: 'cm-number' },

  // 关键字
  { tag: tags.keyword, class: 'cm-keyword' },

  // 注释
  { tag: tags.comment, class: 'cm-comment' },
  { tag: tags.lineComment, class: 'cm-comment' },
  { tag: tags.blockComment, class: 'cm-comment' },
  { tag: tags.docComment, class: 'cm-comment' },

  // 变量
  { tag: tags.variableName, class: 'cm-variable' },
  { tag: tags.definition(tags.variableName), class: 'cm-def' },
  { tag: tags.function(tags.variableName), class: 'cm-variable-2' },
  { tag: tags.local(tags.variableName), class: 'cm-variable' },
  { tag: tags.special(tags.variableName), class: 'cm-variable-3' },

  // 属性
  { tag: tags.propertyName, class: 'cm-property' },
  { tag: tags.definition(tags.propertyName), class: 'cm-property' },
  { tag: tags.special(tags.propertyName), class: 'cm-property' },

  // 操作符
  { tag: tags.operator, class: 'cm-operator' },
  { tag: tags.arithmeticOperator, class: 'cm-operator' },
  { tag: tags.logicOperator, class: 'cm-operator' },
  { tag: tags.bitwiseOperator, class: 'cm-operator' },
  { tag: tags.compareOperator, class: 'cm-operator' },
  { tag: tags.updateOperator, class: 'cm-operator' },
  { tag: tags.definitionOperator, class: 'cm-operator' },
  { tag: tags.controlOperator, class: 'cm-operator' },
  { tag: tags.derefOperator, class: 'cm-operator' },

  // URL 和链接
  { tag: tags.url, class: 'cm-url' },
  { tag: tags.link, class: 'cm-link' },

  // 原子值
  { tag: tags.atom, class: 'cm-atom' },
  { tag: tags.bool, class: 'cm-atom' },
  { tag: tags.null, class: 'cm-atom' },
  { tag: tags.self, class: 'cm-atom' },

  // 元信息
  { tag: tags.meta, class: 'cm-meta' },
  { tag: tags.annotation, class: 'cm-meta' },
  { tag: tags.modifier, class: 'cm-meta' },

  // 标题 (Markdown)
  { tag: tags.heading, class: 'cm-header' },
  { tag: tags.heading1, class: 'cm-header cm-header-1' },
  { tag: tags.heading2, class: 'cm-header cm-header-2' },
  { tag: tags.heading3, class: 'cm-header cm-header-3' },
  { tag: tags.heading4, class: 'cm-header cm-header-4' },
  { tag: tags.heading5, class: 'cm-header cm-header-5' },
  { tag: tags.heading6, class: 'cm-header cm-header-6' },

  // 强调 (Markdown)
  { tag: tags.emphasis, class: 'cm-em' },
  { tag: tags.strong, class: 'cm-strong' },
  { tag: tags.strikethrough, class: 'cm-strikethrough' },

  // 引用 (Markdown)
  { tag: tags.quote, class: 'cm-quote' },

  // 列表 (Markdown)
  { tag: tags.list, class: 'cm-list' },

  // 内容分隔符
  { tag: tags.contentSeparator, class: 'cm-hr' },

  // 类型
  { tag: tags.typeName, class: 'cm-type' },
  { tag: tags.className, class: 'cm-type' },
  { tag: tags.namespace, class: 'cm-qualifier' },
  { tag: tags.labelName, class: 'cm-tag' },

  // 标签 (HTML/XML)
  { tag: tags.tagName, class: 'cm-tag' },
  { tag: tags.angleBracket, class: 'cm-bracket' },
  { tag: tags.attributeName, class: 'cm-attribute' },
  { tag: tags.attributeValue, class: 'cm-string' },

  // 括号
  { tag: tags.paren, class: 'cm-bracket' },
  { tag: tags.squareBracket, class: 'cm-bracket' },
  { tag: tags.brace, class: 'cm-bracket' },

  // 标点
  { tag: tags.punctuation, class: 'cm-punctuation' },
  { tag: tags.separator, class: 'cm-punctuation' },

  // 转义
  { tag: tags.escape, class: 'cm-escape' },

  // 正则表达式
  { tag: tags.regexp, class: 'cm-string-2' },

  // 代码/内联代码 (Markdown)
  { tag: tags.monospace, class: 'cm-comment' },

  // 处理中/无效
  { tag: tags.processingInstruction, class: 'cm-meta' },
  { tag: tags.invalid, class: 'cm-invalidchar' },

  // 特殊字符
  { tag: tags.character, class: 'cm-string' },
]);

/**
 * @typedef {import('~types/editor').EditorConfiguration} EditorConfiguration
 * @typedef {import('~types/editor').EditorEventCallback<keyof import('~types/editor').EditorEventMap>} EditorEventCallback
 * @typedef {import('~types/editor').CM6Adapter} CM6AdapterType
 * @typedef {import('~types/editor').TextMarker} TextMarker
 * @typedef {import('~types/editor').MarkInfo} MarkInfo
 * @typedef {import('~types/editor').MarkTextOptions} MarkTextOptions
 * @typedef {import('~types/editor').SearchCursor} SearchCursor
 * @typedef {import('~types/editor').ScrollInfo} ScrollInfo
 * @typedef {import('@codemirror/state').SelectionRange} SelectionRange
 * @typedef {import('@codemirror/view').Rect} Rect
 */

/**
 * @typedef {Object} MarkEffectValue
 * @property {number} from - 起始位置（文档偏移量）
 * @property {number} to - 结束位置（文档偏移量）
 * @property {Decoration} [decoration] - 装饰对象
 * @property {MarkTextOptions} [options] - 标记选项
 * @property {string} [markId] - 用于追踪 mark 的唯一标识符
 */

// 创建用于动态切换 keymap 的 Compartment
const keymapCompartment = new Compartment();
// 创建用于 vim 模式的 Compartment
const vimCompartment = new Compartment();

// vim 模块缓存
let vimModule = null;
// vim 模块加载状态锁，防止并发加载
let vimModuleLoading = false;
// vim 模块加载等待队列
let vimModuleLoadPromise = null;

/**
 * 动态加载 vim 模块
 * @returns {Promise<any>} vim 模块
 */
async function loadVimModule() {
  // 如果已经加载完成，直接返回
  if (vimModule) {
    return vimModule;
  }

  // 如果正在加载中，等待加载完成
  if (vimModuleLoading && vimModuleLoadPromise) {
    return vimModuleLoadPromise;
  }

  // 设置加载锁
  vimModuleLoading = true;

  try {
    // 创建加载 Promise 并保存，供其他并发调用等待
    vimModuleLoadPromise = import('@replit/codemirror-vim');
    vimModule = await vimModuleLoadPromise;
    return vimModule;
  } catch (e) {
    Logger.error('Failed to load @replit/codemirror-vim. Please install it: npm install @replit/codemirror-vim');
    throw e;
  } finally {
    // 无论成功失败，都释放加载锁
    vimModuleLoading = false;
    vimModuleLoadPromise = null;
  }
}

// 创建搜索高亮效果 - 用于添加 cm-searching 类
/** @type {import('@codemirror/state').StateEffectType<import('@codemirror/view').DecorationSet>} */
const setSearchHighlightEffect = StateEffect.define();

// 搜索高亮的 StateField
const searchHighlightField = StateField.define({
  create() {
    return Decoration.none;
  },
  update(currentDecorations, tr) {
    let updatedDecorations = currentDecorations.map(tr.changes);

    for (const effect of tr.effects) {
      if (effect.is(setSearchHighlightEffect)) {
        updatedDecorations = effect.value;
      }
    }

    return updatedDecorations;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/**
 * CodeMirror 6 适配器
 * 提供对 EditorView 的封装，使用 CM6 原生类型
 * @implements {CM6AdapterType}
 */
class CM6Adapter {
  /**
   * 创建 CM6Adapter 实例
   * @param {EditorView} view - EditorView 实例
   */
  constructor(view) {
    /** @type {EditorView} */
    this.view = view;
    /** @type {Map<string, Array<(...args: unknown[]) => void>>} */
    this.eventHandlers = new Map();
    /** @type {'sublime' | 'vim'} */
    this.currentKeyMap = 'sublime';
  }

  // ==================== 代理属性 ====================

  /**
   * 获取编辑器状态
   * @returns {EditorState}
   */
  get state() {
    return this.view.state;
  }

  /**
   * 获取滚动容器 DOM 元素
   * @returns {HTMLElement}
   */
  get scrollDOM() {
    return this.view.scrollDOM;
  }

  /**
   * 分发事务到编辑器
   * @param {...import('@codemirror/state').TransactionSpec} specs - 事务规范
   * @returns {void}
   */
  dispatch(...specs) {
    return this.view.dispatch(...specs);
  }

  /**
   * 请求测量
   * @template T
   * @param {{ read: (view: EditorView) => T; write?: (measure: T, view: EditorView) => void }} [request] - 测量请求
   * @returns {void}
   */
  requestMeasure(request) {
    return this.view.requestMeasure(request);
  }

  /**
   * 坐标转位置
   * @param {{ x: number; y: number }} coords - 坐标
   * @returns {number | null}
   */
  posAtCoords(coords) {
    return this.view.posAtCoords(coords);
  }

  /**
   * 获取行块信息
   * @param {number} pos - 位置
   * @returns {import('@codemirror/view').BlockInfo}
   */
  lineBlockAt(pos) {
    return this.view.lineBlockAt(pos);
  }

  // ==================== 基本操作 ====================

  /**
   * 获取编辑器全部内容
   * @returns {string} 文档内容字符串
   */
  getValue() {
    return this.view.state.doc.toString();
  }

  /**
   * 设置编辑器内容
   * @param {string} value - 要设置的文本内容
   * @returns {void}
   */
  setValue(value) {
    this.view.dispatch({
      changes: { from: 0, to: this.view.state.doc.length, insert: value },
    });
  }

  /**
   * 获取当前选中的文本
   * @returns {string} 选中的文本，如果没有选中则返回空字符串
   */
  getSelection() {
    const { from, to } = this.view.state.selection.main;
    return this.view.state.doc.sliceString(from, to);
  }

  /**
   * 获取所有选区的文本
   * @returns {string[]} 所有选区文本的数组
   */
  getSelections() {
    return this.view.state.selection.ranges.map((range) => this.view.state.doc.sliceString(range.from, range.to));
  }

  /**
   * 替换当前选中的文本
   * @param {string} text - 替换文本
   * @param {'around' | 'start'} [select='around'] - 替换后的选区行为
   * @returns {void}
   */
  replaceSelection(text, select = 'around') {
    const { from, to } = this.view.state.selection.main;
    this.view.dispatch({
      changes: { from, to, insert: text },
      selection: select === 'around' ? { anchor: from + text.length } : undefined,
    });
  }

  /**
   * 替换多个选区的文本
   * @param {string[]} texts - 替换文本数组
   * @param {'around' | 'start'} [select='around'] - 替换后的选区行为
   * @returns {void}
   */
  replaceSelections(texts, select = 'around') {
    const { ranges } = this.view.state.selection;
    const changes = ranges.map((range, i) => ({
      from: range.from,
      to: range.to,
      insert: texts[i] || '',
    }));

    // 计算新的选区位置
    let newSelections;
    if (select === 'around') {
      // 选区移动到替换文本的末尾
      let offset = 0;
      newSelections = ranges.map((range, i) => {
        const text = texts[i] || '';
        const newFrom = range.from + offset;
        const newTo = newFrom + text.length;
        // 更新偏移量：新文本长度 - 原文本长度
        offset += text.length - (range.to - range.from);
        return EditorSelection.range(newTo, newTo);
      });
    } else if (select === 'start') {
      // 选区移动到替换文本的开头
      let offset = 0;
      newSelections = ranges.map((range, i) => {
        const text = texts[i] || '';
        const newFrom = range.from + offset;
        offset += text.length - (range.to - range.from);
        return EditorSelection.range(newFrom, newFrom);
      });
    }

    this.view.dispatch({
      changes,
      selection: newSelections ? EditorSelection.create(newSelections) : undefined,
    });
  }

  // ==================== 光标和选区操作 ====================

  /**
   * 获取光标位置（文档偏移量）
   * @param {'head' | 'anchor'} [type='head'] - 'head' 返回光标头部位置，'anchor' 返回锚点位置
   * @returns {number} 光标位置（文档偏移量）
   */
  getCursor(type = 'head') {
    return type === 'head' ? this.view.state.selection.main.head : this.view.state.selection.main.anchor;
  }

  /**
   * 设置光标位置
   * @param {number} pos - 光标位置（文档偏移量）
   * @returns {void}
   */
  setCursor(pos) {
    this.view.dispatch({ selection: { anchor: pos } });
  }

  /**
   * 设置选区
   * @param {number} anchor - 选区锚点位置（文档偏移量）
   * @param {number} [head] - 选区头部位置（文档偏移量），不传则与 anchor 相同
   * @returns {void}
   */
  setSelection(anchor, head) {
    const headPos = head !== undefined ? head : anchor;
    this.view.dispatch({ selection: { anchor, head: headPos } });
  }

  /**
   * 获取所有选区
   * @returns {readonly SelectionRange[]} CM6 原生 SelectionRange 数组
   */
  listSelections() {
    return this.view.state.selection.ranges;
  }

  // ==================== 行操作 ====================

  /**
   * 获取指定行的内容
   * @param {number} lineNumber - 行号（1-indexed，与 CM6 一致）
   * @returns {string} 行内容字符串
   */
  getLine(lineNumber) {
    const lineObj = this.view.state.doc.line(lineNumber);
    return lineObj.text;
  }

  /**
   * 获取文档总行数
   * @returns {number} 行数
   */
  lineCount() {
    return this.view.state.doc.lines;
  }

  /**
   * 获取指定范围的文本
   * @param {number} from - 起始位置（文档偏移量）
   * @param {number} to - 结束位置（文档偏移量）
   * @returns {string} 范围内的文本
   */
  getRange(from, to) {
    return this.view.state.doc.sliceString(from, to);
  }

  /**
   * 替换指定范围的文本
   * @param {string} text - 替换文本
   * @param {number} from - 起始位置（文档偏移量）
   * @param {number} [to] - 结束位置（文档偏移量），不传则在 from 位置插入
   * @returns {void}
   */
  replaceRange(text, from, to) {
    const toPos = to !== undefined ? to : from;
    this.view.dispatch({
      changes: { from, to: toPos, insert: text },
    });
  }

  // ==================== 文档操作 ====================

  /**
   * 获取文档对象（返回自身以保持链式调用）
   * @returns {CM6Adapter} CM6Adapter 实例
   */
  getDoc() {
    return this;
  }

  // ==================== 坐标操作 ====================

  /**
   * 获取指定位置的屏幕坐标
   * @param {number} [pos] - 文档位置（偏移量），不传则使用当前光标位置
   * @returns {Rect | null} 坐标信息，包含 left、top、bottom、right
   */
  cursorCoords(pos) {
    const position = pos !== undefined ? pos : this.view.state.selection.main.head;
    return this.view.coordsAtPos(position);
  }

  // ==================== 滚动操作 ====================

  /**
   * 滚动到指定位置
   * @param {number | null} x - 水平滚动位置，null 表示不改变
   * @param {number | null} y - 垂直滚动位置，null 表示不改变
   * @returns {void}
   */
  scrollTo(x, y) {
    if (y !== null) {
      this.view.scrollDOM.scrollTop = y;
    }
    if (x !== null) {
      this.view.scrollDOM.scrollLeft = x;
    }
  }

  /**
   * 将指定位置滚动到可视区域
   * @param {number} pos - 文档位置（偏移量）
   * @returns {void}
   */
  scrollIntoView(pos) {
    this.view.dispatch({
      effects: EditorView.scrollIntoView(pos),
    });
  }

  /**
   * 获取滚动信息
   * @returns {ScrollInfo} 滚动信息对象
   */
  getScrollInfo() {
    return {
      left: this.view.scrollDOM.scrollLeft,
      top: this.view.scrollDOM.scrollTop,
      height: this.view.scrollDOM.scrollHeight,
      width: this.view.scrollDOM.scrollWidth,
      clientHeight: this.view.scrollDOM.clientHeight,
      clientWidth: this.view.scrollDOM.clientWidth,
    };
  }

  // ==================== DOM 操作 ====================

  /**
   * 获取编辑器包装元素
   * @returns {HTMLElement} 包装 DOM 元素
   */
  getWrapperElement() {
    return this.view.dom;
  }

  /**
   * 获取滚动容器元素
   * @returns {HTMLElement} 滚动容器 DOM 元素
   */
  getScrollerElement() {
    return this.view.scrollDOM;
  }

  /**
   * 刷新编辑器布局
   * @returns {void}
   */
  refresh() {
    this.view.requestMeasure();
  }

  /**
   * 聚焦编辑器
   * @returns {void}
   */
  focus() {
    this.view.focus();
  }

  // ==================== 选项操作 ====================

  /**
   * 设置编辑器选项
   * @param {'value' | 'keyMap' | string} option - 选项名称
   * @param {string | boolean | object} value - 选项值
   * @returns {void}
   */
  setOption(option, value) {
    switch (option) {
      case 'value':
        this.setValue(/** @type {string} */ (value));
        break;
      case 'keyMap':
        // 动态切换 keyMap
        this.setKeyMap(/** @type {'sublime' | 'vim'} */ (value));
        break;
      default:
        // 静默忽略不支持的选项，避免过多警告
        break;
    }
  }

  /**
   * 设置键盘映射模式
   * @param {'sublime' | 'vim'} mode - 键盘映射模式
   * @returns {Promise<void>}
   */
  async setKeyMap(mode) {
    if (mode === 'vim') {
      try {
        const vimMod = await loadVimModule();
        this.view.dispatch({
          effects: vimCompartment.reconfigure(vimMod.vim()),
        });
        this.currentKeyMap = 'vim';
      } catch (e) {
        console.warn('Vim mode not available. Using sublime mode instead.');
        this.currentKeyMap = 'sublime';
      }
    } else {
      // sublime 或 default 模式：禁用 vim
      this.view.dispatch({
        effects: vimCompartment.reconfigure([]),
      });
      this.currentKeyMap = 'sublime';
    }
  }

  /**
   * 获取编辑器选项
   * @param {'readOnly' | 'disableInput' | 'value' | string} option - 选项名称
   * @returns {string | boolean | object | null} 选项值
   */
  getOption(option) {
    switch (option) {
      case 'readOnly':
        return this.view.state.readOnly || false;
      case 'disableInput':
        return this.view.state.readOnly || false;
      case 'value':
        return this.getValue();
      default:
        // 静默返回 null，避免过多警告
        return null;
    }
  }

  // ==================== 搜索操作 ====================

  /**
   * 设置搜索查询并高亮匹配
   * @param {string} query - 搜索字符串
   * @param {boolean} [caseSensitive=false] - 是否区分大小写
   * @param {boolean} [isRegex=false] - 是否为正则表达式
   * @returns {void}
   */
  setSearchQuery(query, caseSensitive = false, isRegex = false) {
    // 如果查询为空，清除搜索
    if (!query || query.trim() === '') {
      this.clearSearchQuery();
      return;
    }

    const { doc } = this.view.state;
    const decorations = [];

    // 创建搜索正则表达式
    let searchRe;
    if (isRegex) {
      try {
        searchRe = new RegExp(query, caseSensitive ? 'g' : 'gi');
      } catch (e) {
        console.warn('Invalid regex:', e);
        return;
      }
    } else {
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      searchRe = new RegExp(escaped, caseSensitive ? 'g' : 'gi');
    }

    // 查找所有匹配并创建装饰
    const text = doc.toString();
    let match;
    searchRe.lastIndex = 0;

    while ((match = searchRe.exec(text)) !== null) {
      const from = match.index;
      const to = from + match[0].length;

      decorations.push(
        Decoration.mark({
          class: 'cm-searching',
        }).range(from, to),
      );

      // 防止无限循环（当匹配空字符串时）
      if (match[0].length === 0) {
        searchRe.lastIndex += 1;
      }
    }

    // 应用装饰
    this.view.dispatch({
      effects: setSearchHighlightEffect.of(Decoration.set(decorations)),
    });
  }

  /**
   * 清除搜索高亮
   * @returns {void}
   */
  clearSearchQuery() {
    // 清除所有搜索高亮装饰
    this.view.dispatch({
      effects: setSearchHighlightEffect.of(Decoration.none),
    });
  }

  // ==================== 标记操作 ====================

  /**
   * 标记指定范围的文本
   * @param {number} from - 起始位置（文档偏移量）
   * @param {number} to - 结束位置（文档偏移量）
   * @param {MarkTextOptions} options - 标记选项
   * @returns {TextMarker} 标记对象
   */
  markText(from, to, options) {
    // 创建装饰
    const decoration = options.replacedWith
      ? Decoration.replace({ widget: new ReplacementWidget(options.replacedWith) })
      : Decoration.mark({
          class: options.className,
          attributes: options.title ? { title: options.title } : undefined,
        });

    // 生成唯一标识符用于追踪 mark
    const markId = `mark_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // 添加到状态，同时存储原始位置信息和 markId
    this.view.dispatch({
      effects: addMark.of({ from, to, decoration, options, markId }),
    });

    // 保存对 view 的引用，用于 find() 方法
    const { view } = this;
    // 保存 markId 用于后续查找和删除
    const savedMarkId = markId;

    // 返回一个 mark 对象
    return {
      clear: () => {
        // 使用 markId 精确删除
        view.dispatch({
          effects: removeMark.of({ from, to, markId: savedMarkId }),
        });
      },
      find: () => {
        // 动态查找当前 mark 的位置，使用 markId 精确匹配
        const marks = view.state.field(markField, false);
        if (!marks) return null;

        // 遍历所有 mark 找到匹配的 markId
        const iter = marks.iter();
        while (iter.value) {
          // 优先通过 markId 精确匹配
          if (iter.value.spec?.markId === savedMarkId) {
            return { from: iter.from, to: iter.to };
          }
          iter.next();
        }

        // 如果找不到，返回原始位置
        return { from, to };
      },
      className: options.className,
      markId: savedMarkId,
    };
  }

  /**
   * 查找指定范围内的标记
   * @param {number} from - 起始位置（文档偏移量）
   * @param {number} to - 结束位置（文档偏移量）
   * @returns {MarkInfo[]} 标记信息数组
   */
  findMarks(from, to) {
    // 从 markField 中获取当前的装饰
    const marks = this.view.state.field(markField, false);
    if (!marks) return [];

    /** @type {MarkInfo[]} */
    const result = [];
    const iter = marks.iter();
    while (iter.value) {
      // 检查装饰是否与指定范围重叠
      if (iter.from <= to && iter.to >= from) {
        result.push({
          from: iter.from,
          to: iter.to,
          className: iter.value.spec?.class || '',
        });
      }
      iter.next();
    }
    return result;
  }

  // ==================== 搜索游标 ====================

  /**
   * 获取搜索游标
   * @param {string | RegExp} query - 搜索字符串或正则表达式
   * @param {number} [pos=0] - 起始搜索位置（文档偏移量）
   * @param {boolean} [caseFold] - 是否忽略大小写（true 忽略，false 区分）
   * @returns {SearchCursor} 搜索游标对象
   */
  getSearchCursor(query, pos = 0, caseFold) {
    const searchQuery = new SearchQuery({
      search: typeof query === 'string' ? query : query.source,
      regexp: query instanceof RegExp,
      caseSensitive: caseFold === false, // caseFold 为 false 时表示大小写敏感
    });

    let currentPos = pos;
    const { doc } = this.view.state;

    // 使用闭包变量存储搜索结果，避免多个搜索游标互相干扰
    /** @type {{ from: number; to: number } | null} */
    let lastSearchResult = null;

    // 用于向前搜索的辅助函数
    const findPreviousMatch = (/** @type {number} */ fromPos) => {
      // 从文档开始到指定位置查找所有匹配
      const cursor = searchQuery.getCursor(doc, 0);
      let lastMatch = null;

      let result = cursor.next();
      while (!result.done && result.value.from < fromPos) {
        lastMatch = result.value;
        result = cursor.next();
      }

      return lastMatch;
    };

    return {
      findNext: () => {
        const result = searchQuery.getCursor(doc, currentPos).next();
        if (result.done) return false;

        currentPos = result.value.to;
        lastSearchResult = result.value;

        const matched = doc.sliceString(result.value.from, result.value.to);
        const matchArr = query instanceof RegExp ? matched.match(query) : [matched];
        return matchArr || false;
      },
      findPrevious: () => {
        const prevMatch = findPreviousMatch(currentPos);
        if (!prevMatch) return false;

        currentPos = prevMatch.from;
        lastSearchResult = prevMatch;

        const matched = doc.sliceString(prevMatch.from, prevMatch.to);
        const matchResult = query instanceof RegExp ? matched.match(query) : [matched];
        return matchResult || false;
      },
      from: () => {
        if (!lastSearchResult) return null;
        return lastSearchResult.from;
      },
      to: () => {
        if (!lastSearchResult) return null;
        return lastSearchResult.to;
      },
      matches: (reverse, startPos) => {
        // 返回当前匹配的位置信息
        if (!lastSearchResult) {
          return { from: startPos, to: startPos };
        }
        return { from: lastSearchResult.from, to: lastSearchResult.to };
      },
    };
  }

  // ==================== 事件系统 ====================

  /**
   * 添加事件监听器
   * @param {string} event - 事件名称
   * @param {(...args: unknown[]) => void} handler - 事件处理函数
   * @returns {void}
   */
  on(event, handler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event).push(handler);
  }

  /**
   * 移除事件监听器
   * @param {string} event - 事件名称
   * @param {(...args: unknown[]) => void} handler - 事件处理函数
   * @returns {void}
   */
  off(event, handler) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  /**
   * 触发事件
   * @param {string} event - 事件名称
   * @param {...unknown} args - 事件参数
   * @returns {void}
   */
  emit(event, ...args) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      // 特殊处理 change 事件
      if (event === 'change' && args[0]) {
        /** @type {import('@codemirror/view').ViewUpdate} */
        const update = /** @type {import('@codemirror/view').ViewUpdate} */ (args[0]);
        if (update.changes) {
          update.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
            // 获取事件来源
            let origin;
            if (update.transactions.length > 0) {
              const tr = update.transactions[0];
              const userEvent = tr.annotation(Transaction.userEvent);
              if (userEvent) {
                if (userEvent.includes('input')) origin = '+input';
                else if (userEvent.includes('delete')) origin = '+delete';
                else if (userEvent.includes('undo')) origin = 'undo';
                else if (userEvent.includes('redo')) origin = 'redo';
              }
            }

            const changeObj = {
              from: fromA,
              to: toA,
              text: inserted.toString().split('\n'),
              removed: update.startState.doc.sliceString(fromA, toA).split('\n'),
              origin,
            };

            handlers.forEach((handler) => handler(this, changeObj));
          });
        }
      } else {
        handlers.forEach((handler) => handler(this, ...args));
      }
    }
  }
}

// 替换 Widget
class ReplacementWidget extends WidgetType {
  constructor(dom) {
    super();
    this.dom = dom;
  }

  toDOM() {
    return this.dom;
  }
}

// Mark 状态管理
/** @type {import('@codemirror/state').StateEffectType<MarkEffectValue>} */
const addMark = StateEffect.define();
/** @type {import('@codemirror/state').StateEffectType<{from: number, to: number, markId?: string}>} */
const removeMark = StateEffect.define();

const markField = StateField.define({
  create() {
    return Decoration.none;
  },
  update(currentMarks, tr) {
    let updatedMarks = currentMarks.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(addMark) && effect.value) {
        // 创建带有 markId 的装饰
        const decoration = effect.value.decoration.range(effect.value.from, effect.value.to);
        // 在装饰的 spec 中存储 markId
        if (effect.value.markId) {
          decoration.value.spec.markId = effect.value.markId;
        }
        updatedMarks = updatedMarks.update({
          add: [decoration],
        });
      } else if (effect.is(removeMark) && effect.value) {
        // 优先使用 markId 匹配，否则使用位置匹配
        updatedMarks = updatedMarks.update({
          filter: (from, to, value) => {
            if (effect.value.markId && value.spec?.markId) {
              return value.spec.markId !== effect.value.markId;
            }
            return from !== effect.value.from || to !== effect.value.to;
          },
        });
      }
    }
    return updatedMarks;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** @type {import('~types/editor')} */
export default class Editor {
  /**
   * @constructor
   * @param {Partial<EditorConfiguration>} options
   */
  constructor(options) {
    /**
     * @property
     * @type {EditorConfiguration}
     */
    this.options = {
      id: 'code', // textarea 的id属性值
      name: 'code', // textarea 的name属性值
      autoSave2Textarea: false,
      editorDom: document.createElement('div'),
      wrapperDom: null,
      autoScrollByCursor: true,
      convertWhenPaste: true,
      keyMap: 'sublime', // 快捷键风格: sublime | vim
      showFullWidthMark: true,
      showSuggestList: true,
      codemirror: {
        lineNumbers: false, // 显示行号
        placeholder: '', // 占位符文本
      },
      toolbars: {},
      onKeydown() {},
      onChange() {},
      onFocus() {},
      onBlur() {},
      onPaste: this.onPaste,
      onScroll: this.onScroll,
    };
    /** @type {CM6AdapterType | null} */
    this.editor = null;

    // 添加缺失的属性
    this.animation = {
      timer: 0,
      destinationTop: 0,
    };
    this.disableScrollListener = false;

    // 保存默认的 keymap 配置，用于禁用/启用快捷键
    /** @type {import('@codemirror/view').KeyBinding[]} */
    this.defaultKeymap = [];
    /** @type {boolean} */
    this.shortcutDisabled = false;

    const { codemirror, ...restOptions } = options;
    if (codemirror) {
      Object.assign(this.options.codemirror, codemirror);
    }
    Object.assign(this.options, restOptions);
    this.$cherry = this.options.$cherry;
  }

  refresh() {
    if (this.editor) {
      this.editor.requestMeasure();
    }
  }

  /**
   * 禁用快捷键
   * @param {boolean} disable 是否禁用快捷键
   */
  disableShortcut = (disable = true) => {
    if (!this.editor || !this.editor.view) {
      return;
    }

    const { view } = this.editor;
    this.shortcutDisabled = disable;

    if (disable) {
      // 禁用快捷键：使用空的 keymap
      view.dispatch({
        effects: keymapCompartment.reconfigure([]),
      });
    } else {
      // 启用快捷键：恢复默认 keymap
      view.dispatch({
        effects: keymapCompartment.reconfigure(keymap.of(this.defaultKeymap)),
      });
    }
  };

  /**
   * 在onChange后处理draw.io的xml数据和图片的base64数据，对这种超大的数据增加省略号，
   * 以及对全角符号进行特殊染色。
   */
  dealSpecialWords = () => {
    /**
     * 如果编辑器隐藏了，则不再处理（否则有性能问题）
     * - 性能问题出现的原因：
     *  1. 纯预览模式下，cherry的高度可能会被设置成auto（也就是没有滚动条）
     *  2. 这时候codemirror的高度也是auto，其"视窗懒加载"提升性能的手段就失效了
     *  3. 这时再大量的调用markText等api就会非常耗时
     * - 经过上述分析，最好的判断应该是判断**编辑器高度是否为auto**，但考虑到一般只有纯预览模式才大概率设置成auto，所以就只判断纯预览模式了
     */
    if (this.$cherry.status.editor === 'hide') {
      return;
    }
    this.formatBigData2Mark(base64Reg, 'cm-url base64');
    this.formatBigData2Mark(imgDrawioXmlReg, 'cm-url drawio');
    this.formatBigData2Mark(longTextReg, 'cm-url long-text');
    if (this.$cherry.options.editor.maxUrlLength > 10) {
      const [protocolUrlPattern, wwwUrlPattern] = createUrlReg(this.$cherry.options.editor.maxUrlLength);
      this.formatBigData2Mark(protocolUrlPattern, 'cm-url url-truncated');
      this.formatBigData2Mark(wwwUrlPattern, 'cm-url url-truncated');
    }
    this.formatFullWidthMark();
  };

  /**
   * 把大字符串变成省略号
   * @param {RegExp} reg 正则
   * @param {string} className 利用codemirror的MarkText生成的新元素的class
   */
  formatBigData2Mark = (reg, className) => {
    const { editor } = this;
    const searcher = editor.getSearchCursor(reg);

    let oneSearch = searcher.findNext();
    for (; oneSearch !== false; oneSearch = searcher.findNext()) {
      // CM6 原生: from() 返回文档偏移量
      const fromPos = searcher.from();
      if (fromPos === null) {
        continue;
      }
      const bigString = oneSearch[2] ?? '';
      // 计算实际的标记范围
      const prefixLength = oneSearch[1]?.length || 0;
      const begin = fromPos + prefixLength;
      const end = begin + bigString.length;

      // 检查是否已经标记过
      if (editor.findMarks(begin, end).length > 0) {
        continue;
      }

      // 创建替换元素
      const newSpan = createElement('span', `cm-string ${className}`, { title: bigString });
      newSpan.textContent = bigString;

      // 标记文本（使用文档偏移量）
      editor.markText(begin, end, { replacedWith: newSpan, atomic: true });
    }
  };

  /**
   * 高亮全角符号 ·|￥|、|：|"|"|【|】|（|）|《|》
   * full width翻译为全角
   */
  formatFullWidthMark() {
    if (!this.options.showFullWidthMark) {
      return;
    }

    const regex = /[·￥、：""【】（）《》]/;
    const { editor } = this;
    const searcher = editor.getSearchCursor(regex);

    let oneSearch = searcher.findNext();
    for (; oneSearch !== false; oneSearch = searcher.findNext()) {
      // CM6 原生: from() 返回文档偏移量
      const fromPos = searcher.from();
      if (fromPos === null) {
        continue;
      }

      const toPos = fromPos + 1;

      // 检查是否已经标记过
      const existMarks = editor.findMarks(fromPos, toPos).filter((item) => {
        return item.className === 'cm-fullWidth';
      });

      if (existMarks.length === 0) {
        editor.markText(fromPos, toPos, {
          className: 'cm-fullWidth',
          title: '按住Ctrl/Cmd点击切换成半角（Hold down Ctrl/Cmd and click to switch to half-width）',
        });
      }
    }
  }

  /**
   * 将全角符号转换为半角符号
   * @param {EditorView | CM6AdapterType} editorView - 编辑器实例
   * @param {MouseEvent} evt - 鼠标事件对象
   */
  toHalfWidth(editorView, evt) {
    const { target } = evt;
    // 判断事件目标是否为HTMLElement，防止类型错误
    if (!(target instanceof HTMLElement)) {
      return;
    }
    // 仅在点击了带有"cm-fullWidth"类名的元素，并且按下了Ctrl（Windows）或Cmd（Mac）键且为鼠标左键时触发
    if (target.classList.contains('cm-fullWidth') && (evt.ctrlKey || evt.metaKey) && evt.buttons === 1) {
      // 获取目标字符的位置信息
      const rect = target.getBoundingClientRect();
      // 由于是单个字符，肯定在同一行，获取字符在编辑器中的起止位置
      // 获取点击字符的文档位置
      const editorRect = editorView.scrollDOM.getBoundingClientRect();
      const x = rect.left - editorRect.left;
      const y = rect.top - editorRect.top;
      // 通过editorView.posAtCoords获取文档位置
      const fromPos = editorView.posAtCoords({ x, y });
      if (fromPos === null) return;
      const line = editorView.state.doc.lineAt(fromPos);
      const from = { line: line.number - 1, ch: fromPos - line.from };
      const to = { line: from.line, ch: from.ch + 1 };
      // 选中该字符
      const selection = EditorSelection.range(
        editorView.state.doc.line(from.line + 1).from + from.ch,
        editorView.state.doc.line(to.line + 1).from + to.ch,
      );
      editorView.dispatch({
        selection,
        scrollIntoView: true,
      });
      // 替换为对应的半角符号
      const replacementText = target.innerText
        .replace('·', '`')
        .replace('￥', '$')
        .replace('、', '/')
        .replace('：', ':')
        .replace('"', '"')
        .replace('"', '"')
        .replace('【', '[')
        .replace('】', ']')
        .replace('（', '(')
        .replace('）', ')')
        .replace('《', '<')
        .replace('》', '>');

      editorView.dispatch({
        changes: {
          from: editorView.state.selection.main.from,
          to: editorView.state.selection.main.to,
          insert: replacementText,
        },
        selection: { anchor: editorView.state.selection.main.from + replacementText.length },
        scrollIntoView: true,
      });
    }
  }
  /**
   *
   * @param {KeyboardEvent} e
   * @param {EditorView} editorView
   */
  /**
   * 处理键盘弹起事件（keyup），用于高亮预览区对应的行
   * @param {KeyboardEvent} e - 键盘事件对象
   * @param {EditorView} editorView - 编辑器实例
   */
  onKeyup = (e, editorView) => {
    // 获取当前主选区的起始位置
    const pos = editorView.state.selection.main.head;
    // 获取当前行号（lineAt 返回的 number 为 1 起始）
    const line = editorView.state.doc.lineAt(pos).number;
    // 高亮预览区对应的行（行号从1开始）
    this.previewer.highlightLine(line);
  };

  /**
   *
   * @param {ClipboardEvent} e
   * @param {CM6AdapterType} editorView
   */
  onPaste(e, editorView) {
    let { clipboardData } = e;
    if (clipboardData) {
      this.handlePaste(e, clipboardData, editorView);
    } else {
      ({ clipboardData } = window);
      this.handlePaste(e, clipboardData, editorView);
    }
  }

  /**
   *
   * @param {ClipboardEvent} event
   * @param {ClipboardEvent['clipboardData']} clipboardData
   * @param {CM6AdapterType} editorView
   * @returns {boolean | void}
   */
  handlePaste(event, clipboardData, editorView) {
    const onPasteRet = this.$cherry.options.callback.onPaste(clipboardData, this.$cherry);
    if (onPasteRet !== false && typeof onPasteRet === 'string') {
      event.preventDefault();
      // 替换选中内容
      editorView.dispatch({
        changes: {
          from: editorView.state.selection.main.from,
          to: editorView.state.selection.main.to,
          insert: onPasteRet,
        },
      });
      return;
    }
    let html = clipboardData.getData('Text/Html');
    const { items } = clipboardData;

    // 优先处理来自 Word 等应用的粘贴内容
    // 有效的内容通常由 StartFragment 和 EndFragment 标记包裹。
    html = html.replace(/^[\s\S]*<!--StartFragment-->|<!--EndFragment-->[\s\S]*$/g, '');

    // 删除其他无关的注释
    html = html.replace(/<!--[^>]+>/g, '');
    /**
     * 处理"右键复制图片"场景
     * 在这种场景下，我们希望粘贴进来的图片可以走文件上传逻辑，所以当检测到这种场景后，我们会清空html
     */
    if (
      /<body>\s*<img [^>]+>\s*<\/body>/.test(html) &&
      items[1]?.kind === 'file' &&
      items[1]?.type.match(/^image\//i)
    ) {
      html = '';
    }

    this.fileUploadCount = 0;
    // 只要有html内容，就不处理剪切板里的其他内容，这么做的后果是粘贴excel内容时，只会粘贴html内容，不会把excel对应的截图粘进来
    for (let i = 0; !html && i < items.length; i++) {
      const item = items[i];
      // 判断是否为图片数据
      if (item && item.kind === 'file' && item.type.match(/^image\//i)) {
        // 读取该图片
        const file = item.getAsFile();
        this.$cherry.options.callback.fileUpload(file, (url, params = {}) => {
          this.fileUploadCount += 1;
          if (typeof url !== 'string') {
            return;
          }
          const mdStr = `${this.fileUploadCount > 1 ? '\n' : ''}${handleFileUploadCallback(url, params, file)}`;
          // 插入内容
          editorView.dispatch({
            changes: {
              from: editorView.state.selection.main.from,
              to: editorView.state.selection.main.to,
              insert: mdStr,
            },
          });
        });
        event.preventDefault();
      }
    }

    // 复制html转换markdown
    const htmlText = clipboardData.getData('text/plain');
    if (!html || !this.options.convertWhenPaste) {
      return true;
    }

    let divObj = document.createElement('DIV');
    divObj.innerHTML = html;
    html = divObj.innerHTML;
    const mdText = htmlParser.run(html);
    if (typeof mdText === 'string' && mdText.trim().length > 0) {
      const selection = editorView.state.selection.main;
      // CM6: 使用文档偏移量而不是 {line, ch}
      const currentCursor = selection.from;

      // 替换选中内容
      editorView.dispatch({
        changes: {
          from: selection.from,
          to: selection.to,
          insert: mdText,
        },
      });

      pasteHelper.showSwitchBtnAfterPasteHtml(this.$cherry, currentCursor, editorView, htmlText, mdText);
      event.preventDefault();
    }
    divObj = null;
  }

  /**
   *
   * @param {EditorView} editorView
   */
  onScroll = (editorView) => {
    this.$cherry.$event.emit('cleanAllSubMenus'); // 滚动时清除所有子菜单，这不应该在Bubble中处理，我们关注的是编辑器的滚动  add by ufec
    if (this.disableScrollListener) {
      this.disableScrollListener = false;
      return;
    }
    const scroller = editorView.scrollDOM;
    if (scroller.scrollTop <= 0) {
      this.previewer.scrollToLineNum(0);
      return;
    }
    if (scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 20) {
      this.previewer.scrollToLineNum(null); // 滚动到底
      return;
    }
    const currentTop = scroller.scrollTop;
    const targetLineBlock = editorView.lineBlockAtHeight(currentTop);
    const targetLine = editorView.state.doc.lineAt(targetLineBlock.from).number - 1; // 行号从 1 开始，转换为 0
    //
    const lineHeight = targetLineBlock.height;
    const lineTop = targetLineBlock.top;
    const percent = (100 * (currentTop - lineTop)) / lineHeight / 100;
    // console.log(percent);
    // codemirror中行号以0开始，所以需要+1
    this.previewer.scrollToLineNum(targetLine + 1, percent);
  };

  /**
   *
   * @param {EditorView} editorView - 当前的CodeMirror实例
   * @param {MouseEvent} evt
   */
  onMouseDown = (editorView, evt) => {
    // 鼠标按下时，清除所有子菜单（如Bubble工具栏等），
    this.$cherry.$event.emit('cleanAllSubMenus'); // Bubble中处理需要考虑太多，直接在编辑器中处理可包括Bubble中所有情况，因为产生Bubble的前提是光标在编辑器中 add by ufec

    // 验证坐标值是否有效
    if (!Number.isFinite(evt.clientX) || !Number.isFinite(evt.clientY)) {
      return;
    }

    const clickPos = editorView.posAtCoords({ x: evt.clientX, y: evt.clientY });
    if (clickPos === null) {
      return;
    }
    const line = editorView.state.doc.lineAt(clickPos);
    const targetLine = line.number - 1;
    const top = Math.abs(evt.y - editorView.scrollDOM.getBoundingClientRect().y);
    this.previewer.scrollToLineNumWithOffset(targetLine + 1, top);
    this.toHalfWidth(editorView, evt);
  };

  /**
   * 光标变化事件
   */
  onCursorActivity = () => {
    this.refreshWritingStatus();
  };

  /**
   *
   * @param {*} previewer
   */
  init(previewer) {
    const textArea = this.options.editorDom.querySelector(`#${this.options.id}`);
    if (!(textArea instanceof HTMLTextAreaElement)) {
      throw new Error('The specific element is not a textarea.');
    }

    // 保存默认 keymap 配置
    this.defaultKeymap = [
      ...defaultKeymap,
      ...historyKeymap,
      ...closeBracketsKeymap,
      ...searchKeymap,
      indentWithTab,
      {
        key: 'Enter',
        run: (view) => {
          // 调用自动缩进处理
          const adapter = new CM6Adapter(view);
          handleNewlineIndentList(adapter);
          return true;
        },
      },
    ];

    // 创建编辑器
    const extensions = [
      syntaxHighlighting(cherryHighlighter),
      // 基础扩展
      markdown(),
      history(),
      search(),
      closeBrackets(),
      syntaxHighlighting(defaultHighlightStyle),

      // 自定义选中样式 - 实现整行高亮效果
      drawSelection({
        cursorBlinkRate: 1200,
        drawRangeCursor: false,
      }),

      // 搜索高亮字段
      searchHighlightField,

      // 条件性添加行号
      ...(this.options.codemirror.lineNumbers ? [lineNumbers()] : []),

      // 键盘映射（使用 Compartment 以支持动态切换）
      keymapCompartment.of(keymap.of(this.defaultKeymap)),

      // Vim 模式（使用 Compartment 以支持动态切换）
      vimCompartment.of([]),

      // 自动换行
      EditorView.lineWrapping,

      // Placeholder
      ...(this.options.codemirror.placeholder ? [placeholder(this.options.codemirror.placeholder)] : []),

      // Mark 字段
      markField,

      // 事件处理
      EditorView.updateListener.of((update) => {
        // 使用箭头函数确保 this 正确绑定
        const adapter = this.editor;
        if (!adapter) return;

        if (update.docChanged) {
          adapter.emit('change', update);
          adapter.emit('beforeChange', adapter);
        }
        if (update.selectionSet) {
          // 触发 beforeSelectionChange 事件,供 FloatMenu 和 Bubble 使用
          const selection = update.state.selection.main;

          // CodeMirror 6中判断是否是用户交互:
          // 1. 如果有明确的select userEvent,肯定是用户交互
          // 2. 如果没有userEvent标记,但selection确实改变了,也可能是用户鼠标选择
          //    (CM6在鼠标选择时不总是生成select userEvent)
          // 3. 排除编程方式触发的选择(比如setValue、replaceRange等会有对应的userEvent)

          let isUserInteraction = false;

          // 方法1: 检查是否有select相关的userEvent
          if (update.transactions.some((tr) => tr.isUserEvent('select'))) {
            isUserInteraction = true;
          }
          // 方法2: 如果没有任何userEvent,但selection确实改变了,认为是用户交互
          // (鼠标拖动选择通常不会产生userEvent)
          else if (update.transactions.length > 0) {
            const hasUserEvent = update.transactions.some((tr) => {
              // 使用 Transaction.userEvent 注解类型来获取用户事件
              const userEvent = tr.annotation(Transaction.userEvent);
              return userEvent !== null && userEvent !== undefined;
            });
            // 如果没有任何userEvent标记,很可能是鼠标选择
            if (!hasUserEvent) {
              isUserInteraction = true;
            }
          }

          this.$cherry.$event.emit('beforeSelectionChange', {
            selection: { from: selection.from, to: selection.to },
            isUserInteraction,
          });
          adapter.emit('cursorActivity');
        }
      }),

      // DOM 事件处理
      EditorView.domEventHandlers({
        keydown: (e) => {
          if (this.editor) this.editor.emit('keydown', e);
          return false;
        },
        keyup: (e) => {
          if (this.editor) this.editor.emit('keyup', e);
          return false;
        },
        mousedown: (e) => {
          if (this.editor) this.editor.emit('mousedown', e);
          return false;
        },
        paste: (e) => {
          if (this.editor) this.editor.emit('paste', e);
          return false;
        },
        drop: (e) => {
          if (this.editor) this.editor.emit('drop', e);
          return false;
        },
        focus: (e) => {
          if (this.editor) this.editor.emit('focus', e);
          return false;
        },
        blur: (e) => {
          if (this.editor) this.editor.emit('blur', e);
          return false;
        },
        scroll: () => {
          if (this.editor) this.editor.emit('scroll');
          return false;
        },
      }),
    ];

    // 创建状态
    const state = EditorState.create({
      doc: this.options.value || textArea.value || '',
      extensions,
    });

    // 创建视图
    const view = new EditorView({
      state,
      parent: textArea.parentElement,
    });

    // 隐藏原始 textarea
    textArea.style.display = 'none';

    // 创建适配器
    const editor = new CM6Adapter(view);
    this.previewer = previewer;
    this.editor = editor;

    // 绑定事件监听器
    editor.on('blur', (evt) => {
      this.options.onBlur(/** @type {Event} */ (evt), editor);
      this.$cherry.$event.emit('blur', { evt, cherry: this.$cherry });
    });

    editor.on('focus', (evt) => {
      this.options.onFocus(/** @type {Event} */ (evt), editor);
      this.$cherry.$event.emit('focus', { evt, cherry: this.$cherry });
    });

    editor.on('change', () => {
      this.options.onChange(null, editor);
      this.dealSpecialWords();
      if (this.options.autoSave2Textarea) {
        // 将内容同步到 textarea
        textArea.value = editor.getValue();
      }
    });

    editor.on('scroll', () => {
      this.$cherry.$event.emit('onScroll');
      this.onScroll(editor.view);
    });

    editor.on('paste', (evt) => {
      this.onPaste(/** @type {ClipboardEvent} */ (evt), editor);
    });

    editor.on('mousedown', (evt) => {
      this.onMouseDown(view, /** @type {MouseEvent} */ (evt));
    });

    editor.on('keyup', (evt) => {
      this.onKeyup(/** @type {KeyboardEvent} */ (evt), view);
    });

    editor.on('cursorActivity', () => {
      this.onCursorActivity();
    });

    addEvent(
      this.getEditorDom(),
      'wheel',
      () => {
        // 鼠标滚轮滚动时，强制监听滚动事件
        this.disableScrollListener = false;
        // 打断滚动动画
        cancelAnimationFrame(this.animation.timer);
        this.animation.timer = 0;
      },
      false,
    );

    if (this.options.writingStyle !== 'normal') {
      this.initWritingStyle();
    }

    // 初始化 keyMap 模式
    if (this.options.keyMap === 'vim') {
      editor.setKeyMap('vim');
    }

    // 根据配置自动聚焦
    if (this.options.codemirror.autofocus) {
      editor.focus();
    }
  }

  /**
   *
   * @param {number | null} beginLine 起始行，传入null时跳转到文档尾部
   * @param {number} [endLine] 终止行
   * @param {number} [percent] 百分比，取值0~1
   */
  jumpToLine(beginLine, endLine = 0, percent = 0) {
    if (!this.editor || !this.editor.view) return;

    const { view } = this.editor;

    if (beginLine === null) {
      cancelAnimationFrame(this.animation.timer);
      this.disableScrollListener = true;
      const { doc } = view.state;
      const lastLinePos = doc.length;
      view.dispatch({
        effects: EditorView.scrollIntoView(lastLinePos, { y: 'end' }),
      });
      this.animation.timer = 0;
      return;
    }

    const { doc } = view.state;
    const targetLineNumber = Math.min(beginLine + 1, doc.lines);
    const targetLine = doc.line(targetLineNumber);
    const endLineNumber = Math.min(beginLine + endLine + 1, doc.lines);
    const endLineObj = doc.line(endLineNumber);

    const targetLineBlock = view.lineBlockAt(targetLine.from);
    const endLineBlock = view.lineBlockAt(endLineObj.from);

    const height = endLineBlock.top - targetLineBlock.top;
    const targetTop = targetLineBlock.top + height * percent;

    this.animation.destinationTop = Math.ceil(targetTop - 15);

    if (this.animation.timer) {
      return;
    }

    const animationHandler = () => {
      const currentTop = view.scrollDOM.scrollTop;
      const delta = this.animation.destinationTop - currentTop;
      // 100毫秒内完成动画
      const move = Math.ceil(Math.min(Math.abs(delta), Math.max(1, Math.abs(delta) / (100 / 16.7))));
      // console.log('should scroll: ', move, delta, currentTop, this.animation.destinationTop);
      if (delta > 0) {
        if (currentTop >= this.animation.destinationTop) {
          this.animation.timer = 0;
          return;
        }
        this.disableScrollListener = true;
        view.scrollDOM.scrollTop = currentTop + move;
      } else if (delta < 0) {
        if (currentTop <= this.animation.destinationTop || currentTop <= 0) {
          this.animation.timer = 0;
          return;
        }
        this.disableScrollListener = true;
        view.scrollDOM.scrollTop = currentTop - move;
      } else {
        this.animation.timer = 0;
        return;
      }

      // 如果无法再继续滚动，或已到达目标，停止动画
      if (currentTop === view.scrollDOM.scrollTop || move >= Math.abs(delta)) {
        this.animation.timer = 0;
        return;
      }
      this.animation.timer = requestAnimationFrame(animationHandler);
    };
    this.animation.timer = requestAnimationFrame(animationHandler);
  }

  /**
   *
   * @param {number | null} lineNum
   * @param {number} [endLine]
   * @param {number} [percent]
   */
  scrollToLineNum(lineNum, endLine, percent) {
    if (lineNum === null) {
      this.jumpToLine(null);
      return;
    }
    const $lineNum = Math.max(0, lineNum);
    this.jumpToLine($lineNum, endLine, percent);
    Logger.log('滚动预览区域，左侧应scroll to ', $lineNum);
  }

  /**
   *
   * @returns {HTMLElement}
   */
  getEditorDom() {
    return this.options.editorDom;
  }

  /**
   * 添加事件监听器
   * @param {string} event 事件名
   * @param {EditorEventCallback} callback 回调函数
   */
  addListener(event, callback) {
    if (this.editor) {
      this.editor.on(event, callback);
    }
  }

  /**
   * 初始化书写风格
   */
  initWritingStyle() {
    const { writingStyle } = this.options;
    const className = `cherry-editor-writing-style--${writingStyle}`;
    const editorDom = this.getEditorDom();
    // 重置状态
    Array.from(editorDom.classList)
      .filter((className) => className.startsWith('cherry-editor-writing-style--'))
      .forEach((className) => editorDom.classList.remove(className));
    if (writingStyle === 'normal') {
      return;
    }
    editorDom.classList.add(className);
    this.refreshWritingStatus();
  }

  /**
   * 刷新书写状态
   */
  refreshWritingStatus() {
    const { writingStyle } = this.options;
    if (writingStyle !== 'focus' && writingStyle !== 'typewriter') {
      return;
    }
    const className = `cherry-editor-writing-style--${writingStyle}`;
    /**
     * @type {HTMLStyleElement}
     */
    const style = document.querySelector('#cherry-editor-writing-style') || document.createElement('style');
    style.id = 'cherry-editor-writing-style';
    Array.from(document.head.childNodes).find((node) => node === style) || document.head.appendChild(style);
    const { sheet } = style;
    Array.from(Array(sheet.cssRules.length)).forEach(() => sheet.deleteRule(0));

    if (writingStyle === 'focus') {
      // 获取编辑器容器的位置
      const editorDomRect = this.getEditorDom().getBoundingClientRect();
      // 获取光标位置
      const { view } = this.editor;
      const cursorPos = view.state.selection.main.head;
      const cursorCoords = view.coordsAtPos(cursorPos);

      let topHeight = 0;
      let bottomHeight = 0;

      if (cursorCoords) {
        // 计算光标上方的高度（从编辑器顶部到光标位置）
        topHeight = cursorCoords.top - editorDomRect.top;
        // 计算光标下方的高度（从光标位置到编辑器底部）
        // 使用 cursorCoords.bottom 来考虑光标/行的高度
        bottomHeight = editorDomRect.bottom - cursorCoords.bottom;
      }

      sheet.insertRule(`.${className}::before { height: ${topHeight > 0 ? topHeight : 0}px; }`, 0);
      sheet.insertRule(`.${className}::after { height: ${bottomHeight > 0 ? bottomHeight : 0}px; }`, 0);
    }

    if (writingStyle === 'typewriter') {
      // 编辑器顶/底部填充的空白高度 (用于内容不足时使光标所在行滚动到编辑器中央)
      const height = this.editor.scrollDOM.clientHeight / 2;
      sheet.insertRule(`.${className} .cm-editor .cm-scroller::before { height: ${height}px; }`, 0);
      sheet.insertRule(`.${className} .cm-editor .cm-scroller::after { height: ${height}px; }`, 0);
      // CodeMirror 6 中的滚动方式
      this.editor.scrollDOM.scrollTop = height;
    }
  }

  /**
   * 修改书写风格
   */
  setWritingStyle(writingStyle) {
    this.options.writingStyle = writingStyle;
    this.initWritingStyle();
  }

  /**
   * 设置编辑器值
   */
  setValue(value = '') {
    if (this.editor) {
      this.editor.dispatch({
        changes: {
          from: 0,
          to: this.editor.state.doc.length,
          insert: value,
        },
      });
    }
  }

  /**
   * 获取编辑器值
   */
  getValue() {
    return this.editor ? this.editor.state.doc.toString() : '';
  }

  /**
   * 替换选中的文本
   */
  replaceSelections(text = []) {
    if (!this.editor) return;
    const selection = this.editor.state.selection.ranges;

    // 如果只有一个替换文本，应用到所有选区
    if (typeof text === 'string') {
      const changes = selection.map((range) => ({
        from: range.from,
        to: range.to,
        insert: text,
      }));
      this.editor.dispatch({ changes });
      return;
    }

    // 如果是数组，按顺序替换对应的选区
    const changes = selection.map((range, index) => ({
      from: range.from,
      to: range.to,
      insert: text[index] || '', // 如果数组长度不够，用空字符串
    }));

    this.editor.dispatch({ changes });
  }

  /**
   * 获取光标位置
   */
  getCursor() {
    if (!this.editor) return { line: 0, ch: 0 };
    const pos = this.editor.state.selection.main.head;
    const line = this.editor.state.doc.lineAt(pos);
    return {
      line: line.number - 1, // 转换为 0 开始的行号
      ch: pos - line.from,
    };
  }

  /**
   * 设置光标位置
   */
  setCursor(line, ch) {
    if (!this.editor) return;
    const { doc } = this.editor.state;
    const targetLine = doc.line(line + 1); // 转换为 1 开始的行号
    const pos = targetLine.from + ch;
    this.editor.dispatch({
      selection: { anchor: pos, head: pos },
    });
  }

  /**
   * 聚焦编辑器
   */
  focus() {
    if (this.editor) {
      this.editor.focus();
    }
  }

  /**
   * 获取选中的文本
   * @returns {string[]}
   */
  getSelections() {
    if (!this.editor) return [];
    const { view } = this.editor;
    const selections = view.state.selection.ranges.map((range) => view.state.doc.sliceString(range.from, range.to));
    return selections;
  }

  /**
   * 获取当前选中的文本
   * @returns {string}
   */
  getSelection() {
    if (!this.editor) return '';
    const { view } = this.editor;
    const selection = view.state.selection.main;
    return view.state.doc.sliceString(selection.from, selection.to);
  }

  /**
   * 设置选区
   * @param {Object} from - 起始位置 {line: number, ch: number}
   * @param {Object} to - 结束位置 {line: number, ch: number}
   */
  setSelection(from, to) {
    if (!this.editor) return;
    const { view } = this.editor;
    const { doc } = view.state;
    const fromPos = doc.line(from.line + 1).from + from.ch;
    const toPos = doc.line(to.line + 1).from + to.ch;

    view.dispatch({
      selection: EditorSelection.range(fromPos, toPos),
    });
  }
}
