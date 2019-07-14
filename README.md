# TypeScript GTFS importer

GTFS に型を付けて TypeScript で使えるようにするライブラリです  
Node.js のみで動作し、ブラウザでは動作しません

# Example

https://runkit.com/come25136/5d2ac578a079f0001aa2964b

# find, get 関数について

route や trip を検索するために補助関数を実装しています  
しかし、用途によっては 20s 程かかることがある為、一旦 DB に入れることを推奨します
