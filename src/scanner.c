// External scanner for SAS:
//   1. _CARDS_BLOCK  - CARDS/DATALINES freeform data blocks (terminated by ; on its own line)
//   2. _CARDS4_BLOCK - CARDS4/DATALINES4 freeform data blocks (terminated by ;;;; on its own line)
//   3. BLOCK_COMMENT - Nested /* ... */ block comments (SAS allows arbitrary nesting)
//   4. FORMAT_SPECIFIER - Atomic SAS format/informat specifiers ($20., $char40., yymmdd10., dollar12.2, best.)
//   5. MISSING_VALUE - SAS numeric missing values (. or .A-.Z or ._), boundary-checked against dotted names
//   6. _ERROR_SENTINEL - Error-recovery detection sentinel (never referenced in grammar rules)

#include "tree_sitter/parser.h"
#include "tree_sitter/alloc.h"

// Maximum iteration count as safety guard against infinite loops.
#define MAX_ITERATIONS 1000000

enum TokenType {
  _CARDS_BLOCK,      // externals[0] = $._cards_block
  _CARDS4_BLOCK,     // externals[1] = $._cards4_block
  BLOCK_COMMENT,     // externals[2] = $.block_comment
  FORMAT_SPECIFIER,  // externals[3] = $.format_specifier
  MISSING_VALUE,     // externals[4] = $.missing_value
  _ERROR_SENTINEL,   // externals[5] = $._error_sentinel
};

typedef struct {
  bool in_cards;
  bool in_cards4;
} ScannerState;

static inline bool is_any_ws(int32_t c) {
  return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\v' || c == '\f';
}

static inline bool is_digit(int32_t c) {
  return c >= '0' && c <= '9';
}

static inline bool is_ident_start(int32_t c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_';
}

static inline bool is_ident_char(int32_t c) {
  return is_ident_start(c) || is_digit(c);
}

static inline bool is_bad_format_follower(int32_t next) {
  return is_ident_char(next) || next == '*' || next == '&' || next == '%' ||
         next == '\'' || next == '"' || next == '.';
}

void *tree_sitter_sas_external_scanner_create(void) {
  ScannerState *s = ts_calloc(1, sizeof(ScannerState));
  return s;
}

void tree_sitter_sas_external_scanner_destroy(void *payload) {
  ts_free(payload);
}

unsigned tree_sitter_sas_external_scanner_serialize(void *payload, char *buffer) {
  ScannerState *s = payload;
  buffer[0] = s->in_cards ? 1 : 0;
  buffer[1] = s->in_cards4 ? 1 : 0;
  return 2;
}

void tree_sitter_sas_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {
  ScannerState *s = payload;
  if (length >= 2) {
    s->in_cards = buffer[0] != 0;
    s->in_cards4 = buffer[1] != 0;
  } else {
    s->in_cards = false;
    s->in_cards4 = false;
  }
}

bool tree_sitter_sas_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
  ScannerState *state = payload;
  (void)state;

  bool in_error_recovery = valid_symbols[_ERROR_SENTINEL];

  // -------------------------------------------------------------------------
  // 1. CARDS / DATALINES and CARDS4 / DATALINES4 blocks
  // -------------------------------------------------------------------------
  // Guard: refuse during error recovery or when both _CARDS_BLOCK and
  // _CARDS4_BLOCK are simultaneously valid (uncommitted state).
  if (!in_error_recovery && !(valid_symbols[_CARDS_BLOCK] && valid_symbols[_CARDS4_BLOCK])) {
    if (valid_symbols[_CARDS_BLOCK]) {
      unsigned iterations = 0;
      bool at_line_start = true;

      while (!lexer->eof(lexer) && iterations < MAX_ITERATIONS) {
        iterations++;

        if (at_line_start) {
          while (!lexer->eof(lexer) && (lexer->lookahead == ' ' || lexer->lookahead == '\t')) {
            lexer->advance(lexer, false);
            iterations++;
          }

          if (!lexer->eof(lexer) && lexer->lookahead == ';') {
            lexer->advance(lexer, false);
            iterations++;

            while (!lexer->eof(lexer) && (lexer->lookahead == ' ' || lexer->lookahead == '\t')) {
              lexer->advance(lexer, false);
              iterations++;
            }

            if (lexer->eof(lexer) || lexer->lookahead == '\n' || lexer->lookahead == '\r') {
              lexer->mark_end(lexer);
              if (!lexer->eof(lexer) && lexer->lookahead == '\r') {
                lexer->advance(lexer, false);
                iterations++;
              }
              if (!lexer->eof(lexer) && lexer->lookahead == '\n') {
                lexer->advance(lexer, false);
                iterations++;
              }
              lexer->result_symbol = _CARDS_BLOCK;
              return true;
            }
            at_line_start = false;
            continue;
          }

          if (lexer->eof(lexer)) {
            lexer->mark_end(lexer);
            lexer->result_symbol = _CARDS_BLOCK;
            return true;
          }

          at_line_start = false;
          continue;
        }

        if (!lexer->eof(lexer)) {
          if (lexer->lookahead == '\n') {
            lexer->advance(lexer, false);
            at_line_start = true;
          } else if (lexer->lookahead == '\r') {
            lexer->advance(lexer, false);
            iterations++;
            if (!lexer->eof(lexer) && lexer->lookahead == '\n') {
              lexer->advance(lexer, false);
            }
            at_line_start = true;
          } else {
            lexer->advance(lexer, false);
          }
        }
      }

      lexer->mark_end(lexer);
      lexer->result_symbol = _CARDS_BLOCK;
      return true;
    }

    if (valid_symbols[_CARDS4_BLOCK]) {
      unsigned iterations = 0;
      bool at_line_start = true;

      while (!lexer->eof(lexer) && iterations < MAX_ITERATIONS) {
        iterations++;

        if (at_line_start) {
          while (!lexer->eof(lexer) && (lexer->lookahead == ' ' || lexer->lookahead == '\t')) {
            lexer->advance(lexer, false);
            iterations++;
          }

          if (!lexer->eof(lexer) && lexer->lookahead == ';') {
            int semicolon_count = 0;
            while (!lexer->eof(lexer) && lexer->lookahead == ';' && semicolon_count < 4) {
              lexer->advance(lexer, false);
              iterations++;
              semicolon_count++;
            }

            if (semicolon_count == 4) {
              while (!lexer->eof(lexer) && (lexer->lookahead == ' ' || lexer->lookahead == '\t')) {
                lexer->advance(lexer, false);
                iterations++;
              }

              if (lexer->eof(lexer) || lexer->lookahead == '\n' || lexer->lookahead == '\r') {
                lexer->mark_end(lexer);
                if (!lexer->eof(lexer) && lexer->lookahead == '\r') {
                  lexer->advance(lexer, false);
                  iterations++;
                }
                if (!lexer->eof(lexer) && lexer->lookahead == '\n') {
                  lexer->advance(lexer, false);
                  iterations++;
                }
                lexer->result_symbol = _CARDS4_BLOCK;
                return true;
              }
            }

            at_line_start = false;
            continue;
          }

          if (lexer->eof(lexer)) {
            lexer->mark_end(lexer);
            lexer->result_symbol = _CARDS4_BLOCK;
            return true;
          }

          at_line_start = false;
          continue;
        }

        if (!lexer->eof(lexer)) {
          if (lexer->lookahead == '\n') {
            lexer->advance(lexer, false);
            at_line_start = true;
          } else if (lexer->lookahead == '\r') {
            lexer->advance(lexer, false);
            iterations++;
            if (!lexer->eof(lexer) && lexer->lookahead == '\n') {
              lexer->advance(lexer, false);
            }
            at_line_start = true;
          } else {
            lexer->advance(lexer, false);
          }
        }
      }

      lexer->mark_end(lexer);
      lexer->result_symbol = _CARDS4_BLOCK;
      return true;
    }
  }

  // Nothing else can match if none of the remaining external tokens are valid.
  if (!valid_symbols[BLOCK_COMMENT] &&
      !( !in_error_recovery && (valid_symbols[FORMAT_SPECIFIER] || valid_symbols[MISSING_VALUE]) )) {
    return false;
  }

  // Skip leading whitespace before checking BLOCK_COMMENT / FORMAT_SPECIFIER / MISSING_VALUE.
  while (!lexer->eof(lexer) && is_any_ws(lexer->lookahead)) {
    lexer->advance(lexer, true);
  }

  if (lexer->eof(lexer)) {
    return false;
  }

  // -------------------------------------------------------------------------
  // 2. Nested block comments: /* ... /* ... */ ... */
  // -------------------------------------------------------------------------
  if (valid_symbols[BLOCK_COMMENT] && lexer->lookahead == '/') {
    lexer->advance(lexer, false);
    if (lexer->lookahead == '*') {
      lexer->advance(lexer, false);
      int depth = 1;
      unsigned iterations = 0;

      while (!lexer->eof(lexer) && depth > 0 && iterations < MAX_ITERATIONS) {
        iterations++;
        if (lexer->lookahead == '/') {
          lexer->advance(lexer, false);
          if (!lexer->eof(lexer) && lexer->lookahead == '*') {
            lexer->advance(lexer, false);
            depth++;
          }
        } else if (lexer->lookahead == '*') {
          lexer->advance(lexer, false);
          if (!lexer->eof(lexer) && lexer->lookahead == '/') {
            lexer->advance(lexer, false);
            depth--;
          }
        } else {
          lexer->advance(lexer, false);
        }
      }

      if (depth == 0) {
        lexer->mark_end(lexer);
        lexer->result_symbol = BLOCK_COMMENT;
        return true;
      }
      return false;
    }
    return false;
  }

  if (in_error_recovery) {
    return false;
  }

  // -------------------------------------------------------------------------
  // 3. SAS missing values: . or .A-.Z or ._
  // -------------------------------------------------------------------------
  if (valid_symbols[MISSING_VALUE] && lexer->lookahead == '.') {
    lexer->advance(lexer, false);
    int32_t next = lexer->lookahead;

    // Reject .5 (decimal number), .* (SQL qualified star), .. (double dot)
    if (is_digit(next) || next == '*' || next == '.') {
      return false;
    }

    // .A-.Z or ._ is valid ONLY as a single character after the dot
    if (is_ident_start(next)) {
      lexer->advance(lexer, false);
      if (is_ident_char(lexer->lookahead)) {
        // Multi-character suffix like .id or .log -> NOT a missing value
        return false;
      }
    }

    lexer->mark_end(lexer);
    lexer->result_symbol = MISSING_VALUE;
    return true;
  }

  // -------------------------------------------------------------------------
  // 4. Atomic SAS format/informat specifiers: $20., $char40., yymmdd10., dollar12.2, best.
  // -------------------------------------------------------------------------
  if (valid_symbols[FORMAT_SPECIFIER]) {
    if (lexer->lookahead == '$') {
      lexer->advance(lexer, false);
      if (is_ident_start(lexer->lookahead)) {
        while (!lexer->eof(lexer) && is_ident_char(lexer->lookahead)) {
          lexer->advance(lexer, false);
        }
      } else if (is_digit(lexer->lookahead)) {
        while (!lexer->eof(lexer) && is_digit(lexer->lookahead)) {
          lexer->advance(lexer, false);
        }
      } else {
        return false;
      }

      if (lexer->lookahead != '.') {
        return false;
      }
      lexer->advance(lexer, false);

      while (!lexer->eof(lexer) && is_digit(lexer->lookahead)) {
        lexer->advance(lexer, false);
      }

      if (is_bad_format_follower(lexer->lookahead)) {
        return false;
      }

      lexer->mark_end(lexer);
      lexer->result_symbol = FORMAT_SPECIFIER;
      return true;
    }

    if (is_ident_start(lexer->lookahead)) {
      while (!lexer->eof(lexer) && is_ident_char(lexer->lookahead)) {
        lexer->advance(lexer, false);
      }

      if (lexer->lookahead != '.') {
        return false;
      }
      lexer->advance(lexer, false);

      while (!lexer->eof(lexer) && is_digit(lexer->lookahead)) {
        lexer->advance(lexer, false);
      }

      if (is_bad_format_follower(lexer->lookahead)) {
        return false;
      }

      lexer->mark_end(lexer);
      lexer->result_symbol = FORMAT_SPECIFIER;
      return true;
    }
  }

  return false;
}
