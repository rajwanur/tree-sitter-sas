{
  "targets": [
    {
      "target_name": "tree_sitter_sas_binding",
      "dependencies": [
        "<!(node -e \"require('node-addon-api').targets\"):node_addon_api_except",
      ],
      "sources": [
        "bindings/node/binding.cc",
        "src/parser.c",
        "src/scanner.c",
      ],
      "cflags_c": [
        "-std=c11",
      ],
    }
  ]
}
