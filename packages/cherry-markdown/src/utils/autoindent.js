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
  const { doc } = cm.state;

  // 先检查所有选区是否都符合条件
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i];
    const headPos = range.head;
    const lineObj = doc.lineAt(headPos);
    const ch = headPos - lineObj.from;
    const lineText = lineObj.text;

    const match = cherryListRE.exec(lineText);
    const cursorBeforeBullet = /^\s*$/.test(lineText.slice(0, ch));

    // 如果任一选区不符合条件，直接返回 false
    if (range.from !== range.to || cursorBeforeBullet || !match) return false;
  }

  // 所有选区都符合条件，收集替换内容
  const replacements = [];
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i];
    const headPos = range.head;
    const lineObj = doc.lineAt(headPos);
    const lineText = lineObj.text;
    const match = cherryListRE.exec(lineText);

    if (cherryListEmptyRE.test(lineText)) {
      // 空列表项：删除整行并插入换行
      // 使用 replaceRange 删除从行首到光标位置的内容
      cm.replaceRange('', lineObj.from, headPos);
      replacements[i] = '\n';
    } else {
      const indent = match[1];
      const after = match[3];
      replacements[i] = `\n${indent}I.${after}`;
    }
  }

  // 只有非空列表项才需要 replaceSelections
  const hasNonEmptyReplacement = replacements.some((r) => r !== '\n');
  if (hasNonEmptyReplacement) {
    cm.replaceSelections(replacements);
  }
  return true;
}
