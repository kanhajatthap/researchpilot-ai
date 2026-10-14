// Safe mathematical expression parser
// Only supports basic arithmetic operations with numbers and parentheses

type ExpressionResult = {
  value: number;
  expression: string;
};

function safeEvaluate(expression: string): number {
  if (!expression || typeof expression !== 'string') {
    throw new Error('Expression must be a non-empty string');
  }

  // Remove all whitespace for easier parsing
  const cleaned = expression.replace(/\s+/g, '');

  // Validate that the expression only contains allowed characters
  if (!/^[0-9+\-*/().]+$/.test(cleaned)) {
    throw new Error('Invalid mathematical expression');
  }

  // Two numeric literals separated only by whitespace (e.g. "2 3" in
  // "2 3 + 4") are malformed. Because whitespace is stripped above, they would
  // otherwise be silently merged into a single number ("23+4"), changing the
  // expression's meaning. Reject them explicitly instead.
  if (/\d\s+(?=[\d.])/.test(expression)) {
    throw new Error('Invalid mathematical expression format');
  }

  // Check for consecutive operators or misplaced parentheses
  if (
    /[+\-*/]{2,}/.test(cleaned) || // Multiple consecutive operators
    /[+\-*/]$/.test(cleaned) ||    // Ends with operator
    /^[+\-*/]/.test(cleaned) ||    // Starts with operator (except for unary minus)
    /\(\s*\)/.test(cleaned) ||     // Empty parentheses
    /\(\s*[+\-*/]/.test(cleaned) || // Parentheses followed by operator (except for unary minus)
    /[+\-*/]\s*\)/.test(cleaned)   // Operator followed by closing parenthesis
  ) {
    // Special cases that are actually valid:
    // 1. Operator followed by minus (for negative numbers): e.g., 5*-2, 3/-4
    // 2. Minus at start (for negative numbers): e.g., -5+3
    
    // Check if it's a valid pattern we should allow
    const validPatterns = [
      /[+\-*]\-[\d.]/,     // *-, /- followed by digit or decimal
      /^-[\d.]/,           // Leading minus followed by digit or decimal
      /\(\-[\d.]/          // (- followed by digit or decimal
    ];
    
    const isValidPattern = validPatterns.some(pattern => pattern.test(cleaned));
    
    if (!isValidPattern) {
      throw new Error('Invalid mathematical expression format');
    }
  }

  // Count parentheses to ensure they're balanced
  let openParenCount = 0;
  let closeParenCount = 0;

  for (const char of cleaned) {
    if (char === '(') openParenCount++;
    if (char === ')') closeParenCount++;
    if (closeParenCount > openParenCount) {
      throw new Error('Unbalanced parentheses');
    }
  }

  if (openParenCount !== closeParenCount) {
    throw new Error('Unbalanced parentheses');
  }

  // Shunting-yard algorithm to convert infix to RPN
  const outputQueue: (number | string)[] = [];
  const operatorStack: string[] = [];

  const precedence: Record<string, number> = {
    '+': 1,
    '-': 1,
    '*': 2,
    '/': 2,
  };

  let i = 0;
  while (i < cleaned.length) {
    const char = cleaned[i];

    if (/[0-9]/.test(char)) {
      // Parse number (including decimals)
      let numStr = '';
      let hasDecimal = false;

      while (i < cleaned.length && (/[0-9]/.test(cleaned[i]) || (cleaned[i] === '.' && !hasDecimal))) {
        if (cleaned[i] === '.') hasDecimal = true;
        numStr += cleaned[i];
        i++;
      }

      outputQueue.push(parseFloat(numStr));
      continue; // Skip the i++ at the end of loop
    } else if (char === '(') {
      operatorStack.push(char);
    } else if (char === ')') {
      while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1] !== '(') {
        outputQueue.push(operatorStack.pop()!);
      }
      if (operatorStack.length === 0) {
        throw new Error('Unbalanced parentheses');
      }
      operatorStack.pop(); // Remove the '('
    } else if (['+', '-', '*', '/'].includes(char)) {
      // Handle unary minus
      const isUnaryMinus =
        char === '-' &&
        (i === 0 ||
          cleaned[i - 1] === '(' ||
          ['+', '-', '*', '/'].includes(cleaned[i - 1]));

      if (isUnaryMinus) {
        // Treat unary minus as part of the number
        let numStr = '-';
        i++;

        let hasDecimal = false;
        while (
          i < cleaned.length &&
          (/[0-9]/.test(cleaned[i]) || (cleaned[i] === '.' && !hasDecimal))
        ) {
          if (cleaned[i] === '.') hasDecimal = true;
          numStr += cleaned[i];
          i++;
        }

        outputQueue.push(parseFloat(numStr));
        continue;
      }

      // Pop operators with higher or equal precedence
      while (
        operatorStack.length > 0 &&
        operatorStack[operatorStack.length - 1] !== '(' &&
        precedence[operatorStack[operatorStack.length - 1]!] >= precedence[char]
      ) {
        outputQueue.push(operatorStack.pop()!);
      }
      operatorStack.push(char);
    } else {
      throw new Error('Invalid character in expression');
    }
    i++;
  }

  // Pop remaining operators
  while (operatorStack.length > 0) {
    const op = operatorStack.pop()!;
    if (op === '(') {
      throw new Error('Unbalanced parentheses');
    }
    outputQueue.push(op);
  }

  // Evaluate RPN
  const stack: number[] = [];

  for (const token of outputQueue) {
    if (typeof token === 'number') {
      stack.push(token);
    } else {
      if (stack.length < 2) {
        throw new Error('Invalid expression');
      }
      const b = stack.pop()!;
      const a = stack.pop()!;

      switch (token) {
        case '+':
          stack.push(a + b);
          break;
        case '-':
          stack.push(a - b);
          break;
        case '*':
          stack.push(a * b);
          break;
        case '/':
          if (b === 0) {
            throw new Error('Division by zero');
          }
          stack.push(a / b);
          break;
        default:
          throw new Error(`Unknown operator: ${token}`);
      }
    }
  }

  if (stack.length !== 1) {
    throw new Error('Invalid expression');
  }

  return stack[0];
}

export { safeEvaluate };