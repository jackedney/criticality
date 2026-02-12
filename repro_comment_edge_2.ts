
import { Project, SyntaxKind } from 'ts-morph';

const project = new Project({
  useInMemoryFileSystem: true,
});

const code = `
function foo() {
  // TODO 1
}

function bar() {
  // TODO 2
  return;
}

// TODO 3
`;

const sourceFile = project.createSourceFile('test_edge_2.ts', code);

const patterns = [/TODO/g];
const text = sourceFile.getFullText();

for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
        console.log(`Match at ${match.index}: '${match[0]}'`);
        const node = sourceFile.getDescendantAtPos(match.index);
        console.log(`  Initial Node: ${node ? node.getKindName() : 'undefined'}`);

        let current = node;
        while (current) {
            const kind = current.getKind();
            console.log(`    -> ${current.getKindName()}`);
            if (
              kind === SyntaxKind.FunctionDeclaration ||
              kind === SyntaxKind.MethodDeclaration ||
              kind === SyntaxKind.ArrowFunction ||
              kind === SyntaxKind.FunctionExpression
            ) {
                console.log(`       (Found Function: ${current.asKind(SyntaxKind.FunctionDeclaration)?.getName()})`);
            }
            if (kind === SyntaxKind.SourceFile) break;
            current = current.getParent();
        }
    }
}
