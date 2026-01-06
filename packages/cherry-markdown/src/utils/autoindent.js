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
 * CodeMirror 6: 处理回车时的列表自动缩进
 * @param {import('~types/editor').CM6Adapter} cm
 */
export function handleNewlineIndentList(cm) {
  if (handleCherryList(cm)) return true;
  // CodeMirror 6: 默认插入换行
  cm.replaceSelection('\n');
  return true;
}

function handleCherryList(cm) {
  const cherryListRE = /^(\s*)([I一二三四五六七八九十]+)\.(\s+)/;
  const cherryListEmptyRE = /^(\s*)([I一二三四五六七八九十]+)\.(\s+)$/;
  // CodeMirror 6: 检查是否只读
  if (cm.getOption('readOnly')) return false;
  const ranges = cm.listSelections();
  const replacements = [];
  const { doc } = cm.state;

  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i];
    // CM6: head 是文档偏移量，需要转换为行信息
    const headPos = range.head;
    const lineObj = doc.lineAt(headPos);
    const lineNumber = lineObj.number; // 1-indexed
    const ch = headPos - lineObj.from; // 光标在行内的位置
    const lineText = lineObj.text;

    const match = cherryListRE.exec(lineText);
    const cursorBeforeBullet = /^\s*$/.test(lineText.slice(0, ch));

    // CM6: 使用 from === to 判断是否为空选区
    if (range.from !== range.to || cursorBeforeBullet || !match) return false;

    if (cherryListEmptyRE.test(lineText)) {
      // CM6: replaceRange 使用文档偏移量
      const fromPos = lineObj.from;
      const toPos = Math.min(headPos + 1, doc.length);
      cm.replaceRange('', fromPos, toPos);
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
