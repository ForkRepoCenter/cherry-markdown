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
import Logger from '@/Logger';
import Toolbar from './Toolbar';
/**
 * 当光标处于编辑器新行起始位置时出现的浮动工具栏
 */
export default class FloatMenu extends Toolbar {
  // constructor(options) {
  //     super(options);
  // }

  init() {
    this.editor = this.$cherry.editor;
    this.editorDom = this.editor.getEditorDom();
    // 添加空值检查，确保 .cm-scroller 存在
    const cmScroller = this.editorDom.querySelector('.cm-scroller');
    if (cmScroller) {
      cmScroller.appendChild(this.options.dom);
    } else {
      Logger.warn('FloatMenu: .cm-scroller not found, appending to editorDom instead');
      this.editorDom.appendChild(this.options.dom);
    }
    this.initAction();
    Object.entries(this.shortcutKeyMap).forEach(([key, value]) => {
      this.$cherry.toolbar.shortcutKeyMap[key] = value;
    });
  }

  appendMenusToDom(menus) {
    this.options.dom.appendChild(menus);
  }

  initAction() {
    // 保存绑定后的事件处理函数引用，以便正确移除
    this.boundHandleSelectionChange = (event) => this.handleSelectionChange(event);
    this.boundHandleContentChange = () => this.handleContentChange();
    this.boundHandleBeforeSelectionChange = (event) => this.handleBeforeSelectionChange(event);
    this.boundHideFloatMenu = () => this.hideFloatMenu();

    // 监听选区变化事件
    this.$cherry.$event.on('selectionChange', this.boundHandleSelectionChange);

    // 监听编辑器内容变化事件
    this.$cherry.$event.on('afterChange', this.boundHandleContentChange);

    // 监听beforeSelectionChange事件（这个事件在Editor.js中已经触发）
    this.$cherry.$event.on('beforeSelectionChange', this.boundHandleBeforeSelectionChange);
  }

  /**
   * 处理选区变化 - 直接使用 CM6 原生 API
   * @param {Object} event 选区变化事件
   */
  handleSelectionChange(event) {
    if (this.editor && this.editor.editor) {
      this.cursorActivity();
    }
  }

  /**
   * 处理内容变化 - 直接使用 CM6 原生 API
   */
  handleContentChange() {
    if (this.editor && this.editor.editor) {
      this.cursorActivity();
    }
  }

  /**
   * 处理beforeSelectionChange事件 - 直接使用 CM6 原生 API
   * @param {Object} selection 选区对象
   */
  handleBeforeSelectionChange({ selection }) {
    if (this.editor && this.editor.editor) {
      this.cursorActivity();
    }
  }

  /**
   * 获取 CM6 EditorView 实例
   * @returns {import('@codemirror/view').EditorView | null}
   */
  getEditorView() {
    if (!this.editor || !this.editor.editor) {
      return null;
    }
    const editorAdapter = this.editor.editor;
    return editorAdapter.view || editorAdapter;
  }

  /**
   * 隐藏浮动菜单
   */
  hideFloatMenu() {
    if (this.options.dom) {
      this.options.dom.style.display = 'none';
    }
  }

  /**
   * 清理事件监听器
   */
  destroy() {
    // 移除 Cherry 事件监听（使用保存的绑定函数引用）
    if (this.boundHandleSelectionChange) {
      this.$cherry.$event.off('selectionChange', this.boundHandleSelectionChange);
    }
    if (this.boundHandleContentChange) {
      this.$cherry.$event.off('afterChange', this.boundHandleContentChange);
    }
    if (this.boundHideFloatMenu) {
      this.$cherry.$event.off('cleanAllSubMenus', this.boundHideFloatMenu);
      this.$cherry.$event.off('onScroll', this.boundHideFloatMenu);
    }
    if (this.boundHandleBeforeSelectionChange) {
      this.$cherry.$event.off('beforeSelectionChange', this.boundHandleBeforeSelectionChange);
    }
  }

  update() {
    const view = this.getEditorView();
    if (!view) return false;

    const { state } = view;

    if (this.isHidden(state)) {
      this.options.dom.style.display = 'none';
      return false;
    }
    this.options.dom.style.display = 'inline-block';
  }

  /**
   * 当光标激活时触发，当光标处于行起始位置时展示float工具栏；反之隐藏
   * 直接使用 CM6 原生 API
   * @returns {boolean | void}
   */
  cursorActivity() {
    const view = this.getEditorView();
    if (!view) return false;

    const { state } = view;
    const lineNumber = state.doc.lineAt(state.selection.main.head).number - 1;

    // CM6 使用 .cm-content 作为内容区域
    const codeMirrorLines = document.querySelector('.cherry-editor .cm-content');
    if (!codeMirrorLines || !(codeMirrorLines instanceof HTMLElement)) {
      return false;
    }
    const computedLinesStyle = getComputedStyle(codeMirrorLines);
    const parsedPaddingLeft = Number.parseFloat(computedLinesStyle.paddingLeft);
    const codeWrapPaddingLeft = Number.isFinite(parsedPaddingLeft) ? parsedPaddingLeft : 0;

    if (this.isHidden(state)) {
      this.options.dom.style.display = 'none';
      return false;
    }
    this.options.dom.style.display = 'inline-block';
    this.options.dom.style.left = `${codeWrapPaddingLeft}px`;

    // 当配置 codemirror.placeholder 时，测量 placeholder 中文本的范围
    // 将浮动工具栏定位到 placeholder 文本后面
    // CM6 使用 .cm-placeholder 类名
    const placeholderEl = codeMirrorLines.querySelector('.cm-placeholder');
    const topOffset = this.getLineHeight(lineNumber, view);
    if (placeholderEl instanceof HTMLElement && placeholderEl.offsetParent !== null) {
      const linesRect = codeMirrorLines.getBoundingClientRect();
      const textNode = Array.from(placeholderEl.childNodes).find(
        (n) => n.nodeType === Node.TEXT_NODE && n.nodeValue && n.nodeValue.trim() !== '',
      );
      if (textNode) {
        const range = document.createRange();
        range.setStart(textNode, 0);
        range.setEnd(textNode, textNode.nodeValue.length);
        const rects = range.getClientRects();
        const lastRect = rects[rects.length - 1];
        const placeholderRightRelative = Math.max(0, lastRect.right - linesRect.left);
        this.options.dom.style.left = `${placeholderRightRelative + codeWrapPaddingLeft - 80}px`;
      }
    }
    this.options.dom.style.top = `${topOffset}px`;
  }

  /**
   * 判断是否需要隐藏Float工具栏
   * 有选中内容，或者光标所在行有内容时隐藏float 工具栏
   * 直接使用 CM6 原生 API
   * @param {import('@codemirror/state').EditorState} state - CM6 编辑器状态
   * @returns {boolean} 是否需要隐藏float工具栏，true：需要隐藏
   */
  isHidden(state) {
    const { selection, doc } = state;

    // 检查是否有多选
    if (selection.ranges.length > 1) {
      return true;
    }

    // 检查是否有选中文本
    const mainSelection = selection.main;
    if (mainSelection.from !== mainSelection.to) {
      return true;
    }

    // 检查当前行是否有内容
    const lineNumber = doc.lineAt(mainSelection.head).number;
    const lineText = doc.line(lineNumber).text;
    if (lineText) {
      return true;
    }

    return false;
  }

  /**
   * 获取对应行的顶部偏移量，用来定位 float 工具栏
   * 直接使用 CM6 原生 API：coordsAtPos 和 lineBlockAt
   * @see https://codemirror.net/docs/ref/#view.EditorView.coordsAtPos
   * @see https://codemirror.net/docs/ref/#view.EditorView.lineBlockAt
   * @param {number} line 0-indexed 行号
   * @param {import('@codemirror/view').EditorView} editorView CM6 EditorView 实例
   * @returns {number}
   */
  getLineHeight(line, editorView) {
    if (!editorView || !editorView.state || !editorView.state.doc) {
      return line * 20; // 默认行高
    }

    try {
      const { doc } = editorView.state;
      // line 是 0-indexed，doc.line 需要 1-indexed
      const lineNumber = line + 1;

      // 边界检查：确保行号在有效范围内
      if (lineNumber < 1 || lineNumber > doc.lines) {
        return line * 20;
      }

      const docLine = doc.line(lineNumber);

      // 策略1：使用 coordsAtPos 获取精确坐标（CM6 原生 API）
      const topCoords = editorView.coordsAtPos(docLine.from);

      if (topCoords) {
        // 正常情况：使用 coordsAtPos 的结果
        const scrollerRect = editorView.scrollDOM.getBoundingClientRect();
        const { scrollTop } = editorView.scrollDOM;

        // 计算行顶部相对于 .cm-scroller 的位置
        const lineTop = topCoords.top - scrollerRect.top + scrollTop;
        const lineHeight = topCoords.bottom - topCoords.top;
        const menuHeight = this.options.dom ? this.options.dom.offsetHeight : 26;

        // 返回垂直居中的位置
        return lineTop + (lineHeight - menuHeight) / 2;
      }

      // 策略2：使用 lineBlockAt（CM6 原生 API）
      const lineBlock = editorView.lineBlockAt(docLine.from);
      if (lineBlock) {
        const menuHeight = this.options.dom ? this.options.dom.offsetHeight : 26;
        const lineHeight = lineBlock.height || 20;
        return lineBlock.top + (lineHeight - menuHeight) / 2;
      }
    } catch (error) {
      Logger.warn('Error getting line height:', error);
    }

    // 降级方案：使用默认行高
    return line * 20;
  }
}
