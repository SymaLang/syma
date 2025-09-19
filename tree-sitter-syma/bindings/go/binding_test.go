package tree_sitter_syma_test

import (
	"testing"

	tree_sitter "github.com/tree-sitter/go-tree-sitter"
	tree_sitter_syma "github.com/tree-sitter/tree-sitter-syma/bindings/go"
)

func TestCanLoadGrammar(t *testing.T) {
	language := tree_sitter.NewLanguage(tree_sitter_syma.Language())
	if language == nil {
		t.Errorf("Error loading Syma grammar")
	}
}
