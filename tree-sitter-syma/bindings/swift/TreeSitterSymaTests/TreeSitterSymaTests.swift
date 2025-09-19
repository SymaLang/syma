import XCTest
import SwiftTreeSitter
import TreeSitterSyma

final class TreeSitterSymaTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_syma())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading Syma grammar")
    }
}
