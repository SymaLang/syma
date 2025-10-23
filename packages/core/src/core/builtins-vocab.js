/*****************************************************************
 * Syma Builtins Vocabulary
 *
 * List of all built-in symbols that should never be qualified
 * during module compilation. These symbols are part of the
 * language's core semantics.
 ******************************************************************/

export const BUILTINS = [
  // Boolean values
  'True', 'False', 'Empty',

  // Arithmetic operations
  'Add', 'Sub', 'Mul', 'Div', 'Mod', 'Pow', 'Sqrt', 'Abs', 'Min', 'Max',
  'Floor', 'Ceil', 'Round',
  // Arithmetic aliases
  '+', '-', '*', '/', '%', '^',

  // Bitwise operations
  'BitAnd', 'BitOr', 'BitXor', 'BitNot', 'BitShiftLeft', 'BitShiftRight',
  'BitShiftRightUnsigned',
  // Bitwise aliases
  '&', '|', '~', '<<', '>>', '>>>',

  // String operations
  'Concat', 'ToString', 'ToNormalString', 'ToUpper', 'ToLower', 'Trim', 'StrLen',
  'Substring', 'IndexOf', 'Replace', 'ReplaceAll', 'Split', 'SplitBy', 'SplitToChars',
  'Join', 'Escape', 'Unescape', 'Strings', 'Chars', 'CharFromCode',
  // String aliases
  'Length', 'Slice',

  // Comparison and logic
  'Eq', 'Neq', 'Lt', 'Gt', 'Lte', 'Gte', 'And', 'Or', 'Not',
  // Comparison aliases
  '==', '!=', '<', '>', '<=', '>=',

  // Type checks
  'IsNum', 'IsStr', 'IsSym', 'IsTrue', 'IsFalse', 'AreNums', 'AreStrings', 'AreSyms',

  // Utilities
  'FreshId', 'Random', 'ParseNum', 'ToNumber', 'Debug', 'If', 'Reverse',

  // Serialization
  'Serialize', 'Deserialize',

  // Projection
  'ProjectToString',

  // Special forms (language constructs)
  'R', 'Universe', 'Program', 'Rules', 'RuleRules', 'App', 'State',
  'UI', 'Apply', 'Bundle', 'Module', 'Import', 'Export', 'Defs', 'Effects',
  'Var', 'VarRest',

  // Runtime operators
  'Show', 'Project', 'Input',

  // Event action combinators
  'Seq', 'When', 'PreventDefault', 'StopPropagation', 'KeyIs',
  'ClearInput', 'SetInput',

  // HTML tags (must remain unqualified for DOM)
  // Document structure
  'Html', 'Head', 'Body', 'Title', 'Base', 'Link', 'Meta', 'Style',
  // Sectioning
  'Article', 'Section', 'Nav', 'Aside', 'Header', 'Footer', 'Main', 'Address',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'Hgroup',
  // Text content
  'Div', 'P', 'Hr', 'Pre', 'Blockquote', 'Ol', 'Ul', 'Li', 'Dl', 'Dt', 'Dd',
  'Figure', 'Figcaption',
  // Inline text
  'A', 'Abbr', 'B', 'Bdi', 'Bdo', 'Br', 'Cite', 'Code', 'Data', 'Dfn', 'Em',
  'I', 'Kbd', 'Mark', 'Q', 'Rp', 'Rt', 'Ruby', 'S', 'Samp', 'Small', 'Span',
  'Strong', 'Sub', 'Sup', 'Time', 'U', 'Var', 'Wbr',
  // Embedded content
  'Area', 'Audio', 'Img', 'Map', 'Track', 'Video', 'Embed', 'Iframe', 'Object',
  'Param', 'Picture', 'Portal', 'Source',
  // Scripting
  'Canvas', 'Noscript', 'Script',
  // Edits
  'Del', 'Ins',
  // Tables
  'Table', 'Caption', 'Colgroup', 'Col', 'Tbody', 'Thead', 'Tfoot', 'Tr', 'Td', 'Th',
  // Forms
  'Form', 'Label', 'Input', 'Button', 'Select', 'Datalist', 'Optgroup', 'Option',
  'Textarea', 'Output', 'Progress', 'Meter', 'Fieldset', 'Legend',
  // Interactive
  'Details', 'Summary', 'Dialog',
  // SVG
  'Svg', 'Circle', 'Ellipse', 'Line', 'Path', 'Polygon', 'Polyline', 'Rect',
  'G', 'Defs', 'Use', 'Symbol', 'ClipPath', 'Mask', 'Pattern', 'LinearGradient',
  'RadialGradient', 'Stop', 'Text', 'Tspan', 'TextPath', 'Image', 'ForeignObject',
  // Special
  // 'Fragment', 'Template', 'Slot',

  // Data structures
  'Frozen', 'Splat', '...!', 'KV', 'Props', 'Obj', 'List', 'Pair',

  // Effect system - Core
  'Pending', 'Inbox',

  // Effect system - Timers
  'Timer', 'Delay', 'TimerComplete', 'AnimationFrame', 'AnimationFrameComplete', 'Now',

  // Effect system - Random
  'RandRequest', 'RandResponse',

  // Effect system - Console I/O
  'Print', 'Message', 'PrintComplete',
  'ReadLine', 'ReadLineComplete', 'GetChar', 'GetCharComplete', 'Char',

  // Effect system - Storage
  'StorageSet', 'StorageGet', 'StorageDel', 'Store', 'Local', 'Session',
  'Key', 'Value', 'StorageSetComplete', 'StorageGetComplete', 'StorageDelComplete',
  'Found', 'Missing', 'Ok',

  // Effect system - Clipboard
  'ClipboardWrite', 'ClipboardRead', 'Text', 'ClipboardWriteComplete',
  'ClipboardReadComplete', 'Denied',

  // Effect system - Navigation
  'Navigate', 'Url', 'NavigateComplete', 'ReadLocation', 'ReadLocationComplete',
  'Location', 'Path', 'Query', 'Hash', 'Replace',

  // Effect system - HTTP
  'HttpReq', 'HttpRes', 'Method', 'Body', 'Headers', 'Status', 'Json', 'Error',

  // Effect system - WebSocket
  'WsConnect', 'WsConnectComplete', 'WsSend', 'WsSendComplete', 'WsRecv',
  'WsClose', 'WsCloseComplete', 'WsError', 'Opened', 'Closed', 'AlreadyClosed',
  'Ack', 'Code', 'Reason', 'Binary',

  // Effect system - File operations (Node.js/REPL)
  'FileRead', 'FileReadComplete', 'FileWrite', 'FileWriteComplete', 'Content',
  'ReadSymaFile', 'ReadSymaFileComplete', 'WriteSymaFile', 'WriteSymaFileComplete',
  'Ast', 'Pretty',

  // Effect system - Process execution (Node.js/REPL)
  'Exec', 'ExecComplete', 'Command', 'Output', 'Exit',

  // Special markers
  ':with', ':scope', ':project', ':innermost'
];
