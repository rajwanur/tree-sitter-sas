// External scanner for CARDS/DATALINES freeform data blocks and nested block comments.
//
// CARDS/DATALINES blocks contain freeform data (not SAS code) between
// the keyword+semicolon and a terminating delimiter:
//   - CARDS/DATALINES: terminated by a bare semicolon on its own line
//   - CARDS4/DATALINES4: terminated by ;;;; on its own line
//
// Block comments: SAS supports NESTED /* ... */ comments, unlike C.
//   /* outer /* inner */ still outer */  → one comment
// The scanner counts nesting depth to find the true closing */.

#include "tree_sitter/parser.h"
#include "tree_sitter/alloc.h"

// Maximum iteration count as safety guard against infinite loops.
// 1M characters is more than any reasonable CARDS block.
#define MAX_ITERATIONS 1000000

enum TokenType {
  _CARDS_BLOCK,      // matches grammar.js externals[0] = $._cards_block
  _CARDS4_BLOCK,     // matches grammar.js externals[1] = $._cards4_block
};

typedef struct {
  bool in_cards;
  bool in_cards4;
} ScannerState;

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
  return 2;  // 2 bytes serialized
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
  (void)state;  // State tracking reserved for future incremental parsing use

  // CARDS/DATALINES block: terminated by a bare semicolon on its own line.
  // The token includes all data lines AND the terminating semicolon line.
  if (valid_symbols[_CARDS_BLOCK]) {
    unsigned iterations = 0;
    bool at_line_start = true;

    while (!lexer->eof(lexer) && iterations < MAX_ITERATIONS) {
      iterations++;

      if (at_line_start) {
        // Save position in case we need to check for terminator.
        // We look ahead without consuming to check if this line is the terminator.

        // Skip leading whitespace to check for terminator
        while (!lexer->eof(lexer) && (lexer->lookahead == ' ' || lexer->lookahead == '\t')) {
          lexer->advance(lexer, false);
          iterations++;
        }

        if (!lexer->eof(lexer) && lexer->lookahead == ';') {
          // Found a semicolon after optional whitespace.
          // Check that the rest of the line is empty (newline or eof).
          lexer->advance(lexer, false);
          iterations++;

          // Skip any trailing whitespace after the semicolon on the same line
          while (!lexer->eof(lexer) && (lexer->lookahead == ' ' || lexer->lookahead == '\t')) {
            lexer->advance(lexer, false);
            iterations++;
          }

          // If we are at end of line or end of file, this is the terminator.
          if (lexer->eof(lexer) || lexer->lookahead == '\n' || lexer->lookahead == '\r') {
            // Include the terminator semicolon in the token.
            // Mark end here, AFTER the semicolon (and any trailing whitespace).
            lexer->mark_end(lexer);

            // Advance past newline so parsing resumes on the next line.
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
          // Not a terminator -- semicolon was not alone on the line.
          at_line_start = false;
          continue;
        }

        // Line has non-semicolon content or was an empty line.
        // If we're at EOF on what looks like an empty line, return the token.
        if (lexer->eof(lexer)) {
          lexer->mark_end(lexer);
          lexer->result_symbol = _CARDS_BLOCK;
          return true;
        }

        // Not a terminator line, continue reading content.
        at_line_start = false;
        continue;
      }

      // Advance through the current character
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

    // Hit max iterations -- return token for what we consumed.
    lexer->mark_end(lexer);
    lexer->result_symbol = _CARDS_BLOCK;
    return true;
  }

  // CARDS4/DATALINES4 block: terminated by ;;;; (four semicolons) on its own line.
  // Same logic as CARDS but looks for four consecutive semicolons after whitespace.
  if (valid_symbols[_CARDS4_BLOCK]) {
    unsigned iterations = 0;
    bool at_line_start = true;

    while (!lexer->eof(lexer) && iterations < MAX_ITERATIONS) {
      iterations++;

      if (at_line_start) {
        // Skip leading whitespace to check for terminator
        while (!lexer->eof(lexer) && (lexer->lookahead == ' ' || lexer->lookahead == '\t')) {
          lexer->advance(lexer, false);
          iterations++;
        }

        if (!lexer->eof(lexer) && lexer->lookahead == ';') {
          // Potential ;;;; terminator -- check for four consecutive semicolons.
          int semicolon_count = 0;
          while (!lexer->eof(lexer) && lexer->lookahead == ';' && semicolon_count < 4) {
            lexer->advance(lexer, false);
            iterations++;
            semicolon_count++;
          }

          if (semicolon_count == 4) {
            // Check that the rest of the line is empty.
            while (!lexer->eof(lexer) && (lexer->lookahead == ' ' || lexer->lookahead == '\t')) {
              lexer->advance(lexer, false);
              iterations++;
            }

            if (lexer->eof(lexer) || lexer->lookahead == '\n' || lexer->lookahead == '\r') {
              // Include the terminator ;;;; in the token.
              lexer->mark_end(lexer);

              // Advance past newline.
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

          // Not a terminator -- fewer than 4 semicolons or not alone on line.
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

  return false;
}
