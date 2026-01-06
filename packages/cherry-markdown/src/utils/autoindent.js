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

/**
 * @typedef {import('~types/editor').CM6Adapter} CM6Adapter
 */

/**
 * CodeMirror 6: 处理回车时的列表自动缩进
 * @param {CM6Adapter} cm - CM6Adapter 实例
 * @returns {boolean} 是否处理了回车
 */
export function handleNewlineIndentList(cm) {
  if (handleCherryList(cm)) return true;
  // CodeMirror 6: 默认插入换行
  cm.replaceSelection('\n');
  return true;
}

/**
 * CodeMirror 6: 处理回车时的列表自动缩进
 * @param {CM6Adapter} cm - CM6Adapter 实例
 * @returns {boolean} 是否处理了列表缩进
 */
function handleCherryList(cm) {
  const cherryListRE = /^(\s*)([I一二三四五六七八九十]+)\.(\s+)/;
  const cherryListEmptyRE = /^(\s*)([I一二三四五六七八九十]+)\.(\s+)$/;

  // CodeMirror 6: 检查是否只读
  if (cm.getOption('readOnly')) return false;

  // CM6 原生: listSelections() 返回 SelectionRange[]
  const ranges = cm.listSelections();
  const replacements = [];
  const { doc } = cm.state;

  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i];
    // CM6 原生: 使用 head 获取光标位置（文档偏移量）
    const headPos = range.head;
    // 获取光标所在行
    const lineInfo = doc.lineAt(headPos);
    const lineNumber = lineInfo.number; // 1-indexed
    const ch = headPos - lineInfo.from; // 行内偏移
    const lineText = cm.getLine(lineNumber);

    const match = cherryListRE.exec(lineText);
    const cursorBeforeBullet = /^\s*$/.test(lineText.slice(0, ch));

    // CM6 原生: 使用 empty 属性判断选区是否为空
    if (!range.empty || cursorBeforeBullet || !match) return false;

    if (cherryListEmptyRE.test(lineText)) {
      // 清空当前行并插入换行
      const lineStart = lineInfo.from;
      const lineEnd = Math.min(headPos + 1, doc.length);
      cm.replaceRange('', lineStart, lineEnd);
      replacements[i] = '\n';
    } else {
      const indent = match[1];
      const after = match[3];
      replacements[i] = `\n${indent}I.${after}`;
    }
  }

  cm.replaceSelections(replacements);
  return true;
}
