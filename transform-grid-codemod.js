/**
 * Codemod para migrar <Grid item xs={…} md={…}> a la nueva API `size={{ xs:…, md:… }}`
 * Esta versión especifica el parser TSX y maneja literales y expresiones.
 * Uso:
 *
 *  Bash / WSL / macOS:
 *    npx jscodeshift -t transform-grid-codemod.js --extensions=tsx --parser=tsx frontend/src/components/UnifiedProfile.tsx --dry
 *    npx jscodeshift -t transform-grid-codemod.js --extensions=tsx --parser=tsx frontend/src --dry
 *    (quitar --dry para aplicar cambios)
 *
 *  PowerShell (Windows):
 *    npx jscodeshift -t transform-grid-codemod.js --extensions=tsx --parser=tsx frontend/src/components/UnifiedProfile.tsx --dry
 *    npx jscodeshift -t transform-grid-codemod.js --extensions=tsx --parser=tsx frontend/src --dry
 */

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);

  // Procesa todas las etiquetas <Grid>
  root.find(j.JSXOpeningElement, { name: { type: 'JSXIdentifier', name: 'Grid' } })
    .forEach(path => {
      const attrs = path.node.attributes;
      let breakpointProps = {};
      const otherAttrs = [];

      attrs.forEach(attr => {
        if (attr.type !== 'JSXAttribute') {
          otherAttrs.push(attr);
          return;
        }
        const name = attr.name.name;
        if (name === 'item') {
          // elimina legacy `item`
          return;
        }
        if (['xs', 'sm', 'md', 'lg', 'xl'].includes(name)) {
          // recolecta valores de breakpoints (expresión o literal)
          let expr;
          if (attr.value && attr.value.type === 'JSXExpressionContainer') {
            expr = attr.value.expression;
          } else if (attr.value && attr.value.type === 'Literal') {
            expr = j.literal(attr.value.value);
          } else {
            expr = j.literal(null);
          }
          breakpointProps[name] = expr;
          return;
        }
        // conserva otros atributos
        otherAttrs.push(attr);
      });

      if (Object.keys(breakpointProps).length) {
        // crea prop size={{ xs: value, md: value, ... }}
        const sizeObject = j.objectExpression(
          Object.entries(breakpointProps).map(([key, expr]) =>
            j.objectProperty(j.identifier(key), expr)
          )
        );
        const sizeAttr = j.jsxAttribute(
          j.jsxIdentifier('size'),
          j.jsxExpressionContainer(sizeObject)
        );
        otherAttrs.push(sizeAttr);
      }

      // reemplaza atributos con otros + size
      path.node.attributes = otherAttrs;
    });

  return root.toSource({ quote: 'single' });
};

// Forzar parser TSX
module.exports.parser = 'tsx';
