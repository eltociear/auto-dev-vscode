import Parser, { Language, Tree } from "web-tree-sitter";
import { TSLanguageConfig } from "./TSLanguageConfig";
import { TSLanguage } from "./TreeSitterLanguage";
import { TextRange } from "../document/TextRange";
import { IdentifierBlockRange } from "../document/IdentifierBlockRange";

export class TreeSitterFile {
	private src: string;
	private tree: Tree;
	private langConfig: TSLanguageConfig;
	private parser: Parser | undefined = undefined;
	private language: Parser.Language;

	constructor(
		src: string,
		tree: Tree,
		tsLanguage: TSLanguageConfig,
		parser: Parser,
		language: Language
	) {
		this.src = src;
		this.tree = tree;
		this.langConfig = tsLanguage;
		this.parser = parser;
		this.language = language;
	}

	static async tryBuild(
		src: string,
		langId: string
	): Promise<TreeSitterFileError | TreeSitterFile> {
		// no scope-res for files larger than 500kb
		if (src.length > 500 * Math.pow(10, 3)) {
			return TreeSitterFileError.FileTooLarge;
		}

		const tsConfig = TSLanguage.fromId(langId);
		if (tsConfig === undefined) {
			return TreeSitterFileError.UnsupportedLanguage;
		}

		const parser = new Parser();
		let language: Language | undefined = undefined;
		try {
			language = await tsConfig.grammar();
			parser.setLanguage(language);
		} catch (error) {
			return TreeSitterFileError.LanguageMismatch;
		}

		if (!language) {
			return TreeSitterFileError.LanguageMismatch;
		}

		// do not permit files that take >1s to parse
		parser.setTimeoutMicros(Math.pow(10, 6));

		const tree = parser.parse(src);
		if (!tree) {
			return TreeSitterFileError.ParseTimeout;
		}

		return new TreeSitterFile(src, tree, tsConfig, parser, language);
	}

	methodRanges(): IdentifierBlockRange[] | TreeSitterFileError {
		if (!this.parser) {
			return TreeSitterFileError.QueryError;
		}

		return this.getByQuery(this.langConfig.methodQuery.scopeQuery);
	}

	private getByQuery(queryString: string): IdentifierBlockRange[] | TreeSitterFileError {
		try {
			const query = this.language.query(queryString);
			const root = this.tree.rootNode;
			const matches = query?.matches(root);

			return (
				matches?.flatMap((match) => {
					// name.definition.method
					const identifierNode = match.captures[0].node;
					const blockNode = match.captures[1].node;

					// definition.method
					return new IdentifierBlockRange(
						TextRange.fromNode(identifierNode),
						TextRange.fromNode(blockNode)
					);
				}) ?? []
			);
		} catch (error) {
			return TreeSitterFileError.QueryError;
		}
	}
}

export enum TreeSitterFileError {
	UnsupportedLanguage,
	ParseTimeout,
	LanguageMismatch,
	QueryError,
	FileTooLarge,
}
