//! This crate provides SAS language support for the [tree-sitter][] parsing library.
//!
//! Typically, you will use the [language][language func] function to add this language to a
//! tree-sitter [Parser][], and then use the parser to parse some code:
//!
//! ```
//! let code = r#"
//! data _null_;
//!     put "Hello, world!";
//! run;
//! "#;
//! let mut parser = tree_sitter::Parser::new();
//! parser.set_language(&tree_sitter_sas::language()).expect("Error loading SAS grammar");
//! let tree = parser.parse(code, None).unwrap();
//! ```

use tree_sitter_language::LanguageFn;

extern "C" {
    fn tree_sitter_sas() -> LanguageFn;
}

pub fn language() -> LanguageFn {
    unsafe { tree_sitter_sas() }
}

pub const NODE_TYPES: &str = include_str!("../../src/node-types.json");
