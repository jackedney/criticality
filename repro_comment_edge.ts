
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

const sourceFile = project.createSourceFile('test_edge.ts', code);

const patterns = [/TODO/g];
const text = sourceFile.getFullText();

for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
        console.log(`Match at ${match.index}: '${match[0]}'`);
        const node = sourceFile.getDescendantAtPos(match.index);
        console.log(`  Node: ${node ? node.getKindName() : 'undefined'}`);

        if (node) {
            let current = node;
            let found = false;
            while (current) {
                const kind = current.getKind();
                 if (
                  kind === SyntaxKind.FunctionDeclaration ||
                  kind === SyntaxKind.MethodDeclaration ||
                  kind === SyntaxKind.ArrowFunction ||
                  kind === SyntaxKind.FunctionExpression
                ) {
                    console.log(`  Found function: ${current.asKind(SyntaxKind.FunctionDeclaration)?.getName()}`);
                    found = true;
                    // break; // Don't break to see all ancestors
                }
                if (kind === SyntaxKind.SourceFile) break;
                current = current.getParent();
            }
        }
    }
}
