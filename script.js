document.addEventListener('DOMContentLoaded', () => {
    // --- State ---
    let state = {
        expression: '',
        result: '0',
        angleMode: 'DEG',
        memory: 0,
        isSecond: false,
        ans: 0,
        history: [],
        progBase: 'DEC'
    };

    // --- DOM Elements ---
    const displayResult = document.getElementById('result-display');
    const displayExpr = document.getElementById('expression-display');
    const angleIndicator = document.getElementById('angle-indicator');
    const memIndicator = document.getElementById('memory-indicator');
    
    // Mode Switching
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.mode-view').forEach(v => v.classList.remove('active'));
            e.target.classList.add('active');
            document.getElementById(e.target.dataset.target).classList.add('active');
            if (e.target.dataset.target === 'mode-graphing') {
                initGraph();
            }
        });
    });

    // History Toggle
    const historyDrawer = document.getElementById('history-drawer');
    document.getElementById('history-toggle').addEventListener('click', () => {
        historyDrawer.classList.toggle('open');
    });
    document.getElementById('clear-history').addEventListener('click', () => {
        state.history = [];
        renderHistory();
    });

    // Angle Toggle
    document.querySelectorAll('#angle-toggle button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#angle-toggle button').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            state.angleMode = e.target.dataset.angle;
            angleIndicator.textContent = state.angleMode;
            evaluateExpression(); // re-eval with new angle mode
        });
    });

    // 2nd Function Toggle
    document.getElementById('btn-2nd').addEventListener('click', (e) => {
        state.isSecond = !state.isSecond;
        e.target.classList.toggle('active-2nd');
        document.querySelectorAll('.fn-primary').forEach(el => el.classList.toggle('hidden'));
        document.querySelectorAll('.fn-secondary').forEach(el => el.classList.toggle('hidden'));
    });

    // --- Core Math Parser (Shunting Yard) ---
    function evaluateExpression() {
        if (!state.expression) {
            displayResult.textContent = '0';
            return;
        }
        try {
            let tokens = tokenize(state.expression);
            let postfix = infixToPostfix(tokens);
            let result = evaluatePostfix(postfix);
            
            // Format result
            if (isNaN(result) || !isFinite(result)) throw new Error("Math Error");
            
            result = fixFloatingPoint(result);
            displayResult.textContent = formatNumber(result);
            displayResult.classList.remove('error-shake');
        } catch (err) {
            displayResult.textContent = 'Error';
            displayResult.classList.add('error-shake');
            setTimeout(() => displayResult.classList.remove('error-shake'), 400);
        }
        adjustFontSize(displayResult);
    }

    function tokenize(expr) {
        let tokens = [];
        let i = 0;
        
        // Normalize symbols
        expr = expr.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
        expr = expr.replace(/π/g, 'PI').replace(/√/g, 'sqrt').replace(/∛/g, 'cbrt');

        while (i < expr.length) {
            let char = expr[i];
            if (/\s/.test(char)) { i++; continue; }
            
            if (/[0-9.]/.test(char)) {
                let num = '';
                while (i < expr.length && /[0-9.E]/.test(expr[i])) {
                    if (expr[i] === 'E') {
                        num += 'E'; i++;
                        if (expr[i] === '+' || expr[i] === '-') { num += expr[i]; i++; }
                        continue;
                    }
                    num += expr[i];
                    i++;
                }
                tokens.push({ type: 'number', value: parseFloat(num) });
                continue;
            }
            
            if (/[a-zA-Z₂₁₀]/.test(char)) {
                let word = '';
                while (i < expr.length && /[a-zA-Z0-9₂₁₀]/.test(expr[i])) {
                    word += expr[i];
                    i++;
                }
                if (['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'log', 'ln', 'log₂', 'sqrt', 'cbrt', 'abs', 'mod'].includes(word)) {
                    tokens.push({ type: 'function', value: word });
                } else if (word === 'PI') {
                    tokens.push({ type: 'constant', value: Math.PI });
                } else if (word === 'e') {
                    tokens.push({ type: 'constant', value: Math.E });
                } else if (word === 'ANS' || word === 'Ans') {
                    tokens.push({ type: 'variable', value: state.ans });
                } else if (word === 'x') {
                    tokens.push({ type: 'variable', value: 'x' });
                } else {
                    throw new Error("Unknown token");
                }
                continue;
            }
            
            if ('+-*/^!%()'.includes(char) || char === 'ⁿ√') {
                // Determine if minus is unary
                if (char === '-') {
                    if (tokens.length === 0 || '+(*/^'.includes(tokens[tokens.length-1].value) || tokens[tokens.length-1].value === 'mod') {
                        tokens.push({ type: 'unary', value: '~' });
                        i++; continue;
                    }
                }
                tokens.push({ type: char === '(' || char === ')' ? 'paren' : 'operator', value: char });
                i++;
                continue;
            }
            
            i++;
        }
        
        // Handle implicit multiplication
        let finalTokens = [];
        for (let j = 0; j < tokens.length; j++) {
            finalTokens.push(tokens[j]);
            if (j < tokens.length - 1) {
                let curr = tokens[j];
                let next = tokens[j+1];
                let needsMult = false;
                
                if (curr.type === 'number' && ['constant', 'variable', 'function'].includes(next.type)) needsMult = true;
                if (curr.type === 'number' && next.value === '(') needsMult = true;
                if (curr.value === ')' && next.type === 'number') needsMult = true;
                if (curr.value === ')' && ['constant', 'variable', 'function', '('].includes(next.type)) needsMult = true;
                if (['constant', 'variable'].includes(curr.type) && ['constant', 'variable', 'function', '('].includes(next.type)) needsMult = true;
                
                if (needsMult) {
                    finalTokens.push({ type: 'operator', value: '*' });
                }
            }
        }
        
        return finalTokens;
    }

    const precedence = {
        '+': 1, '-': 1,
        '*': 2, '/': 2, 'mod': 2,
        '^': 3, 'ⁿ√': 3,
        '~': 4, // Unary minus
        '!': 5, '%': 5
    };

    const isRightAssociative = { '^': true, 'ⁿ√': true, '~': true };

    function infixToPostfix(tokens) {
        let output = [];
        let stack = [];
        
        for (let t of tokens) {
            if (t.type === 'number' || t.type === 'constant' || t.type === 'variable') {
                output.push(t);
            } else if (t.type === 'function') {
                stack.push(t);
            } else if (t.type === 'unary') {
                stack.push(t);
            } else if (t.type === 'operator') {
                while (stack.length > 0) {
                    let top = stack[stack.length - 1];
                    if (top.type === 'operator' || top.type === 'unary') {
                        if ((!isRightAssociative[t.value] && precedence[t.value] <= precedence[top.value]) ||
                            (isRightAssociative[t.value] && precedence[t.value] < precedence[top.value])) {
                            output.push(stack.pop());
                        } else {
                            break;
                        }
                    } else if (top.type === 'function') {
                        output.push(stack.pop());
                    } else {
                        break;
                    }
                }
                stack.push(t);
            } else if (t.value === '(') {
                stack.push(t);
            } else if (t.value === ')') {
                while (stack.length > 0 && stack[stack.length - 1].value !== '(') {
                    output.push(stack.pop());
                }
                if (stack.length === 0) throw new Error("Mismatched parens");
                stack.pop(); // pop '('
            }
        }
        
        while (stack.length > 0) {
            let top = stack.pop();
            if (top.value === '(' || top.value === ')') throw new Error("Mismatched parens");
            output.push(top);
        }
        
        return output;
    }

    function evaluatePostfix(postfix, xValue = 0) {
        let stack = [];
        
        const getAngle = (val) => {
            if (state.angleMode === 'DEG') return val * (Math.PI / 180);
            if (state.angleMode === 'GRAD') return val * (Math.PI / 200);
            return val;
        };
        const fromAngle = (val) => {
            if (state.angleMode === 'DEG') return val * (180 / Math.PI);
            if (state.angleMode === 'GRAD') return val * (200 / Math.PI);
            return val;
        };
        
        for (let t of postfix) {
            if (t.type === 'number' || t.type === 'constant') {
                stack.push(t.value);
            } else if (t.type === 'variable') {
                stack.push(t.value === 'x' ? xValue : state.ans);
            } else if (t.type === 'unary' && t.value === '~') {
                let a = stack.pop();
                stack.push(-a);
            } else if (t.type === 'operator') {
                if (t.value === '!' || t.value === '%') {
                    let a = stack.pop();
                    if (t.value === '%') stack.push(a / 100);
                    if (t.value === '!') stack.push(factorial(a));
                } else {
                    let b = stack.pop();
                    let a = stack.pop();
                    if (a === undefined || b === undefined) throw new Error("Parse error");
                    switch(t.value) {
                        case '+': stack.push(a + b); break;
                        case '-': stack.push(a - b); break;
                        case '*': stack.push(a * b); break;
                        case '/': if(b===0) throw new Error(); stack.push(a / b); break;
                        case 'mod': stack.push(a % b); break;
                        case '^': stack.push(Math.pow(a, b)); break;
                        case 'ⁿ√': stack.push(Math.pow(b, 1/a)); break;
                    }
                }
            } else if (t.type === 'function') {
                let a = stack.pop();
                switch(t.value) {
                    case 'sin': stack.push(Math.sin(getAngle(a))); break;
                    case 'cos': stack.push(Math.cos(getAngle(a))); break;
                    case 'tan': stack.push(Math.tan(getAngle(a))); break;
                    case 'asin': stack.push(fromAngle(Math.asin(a))); break;
                    case 'acos': stack.push(fromAngle(Math.acos(a))); break;
                    case 'atan': stack.push(fromAngle(Math.atan(a))); break;
                    case 'sinh': stack.push(Math.sinh(a)); break;
                    case 'cosh': stack.push(Math.cosh(a)); break;
                    case 'tanh': stack.push(Math.tanh(a)); break;
                    case 'log': stack.push(Math.log10(a)); break;
                    case 'ln': stack.push(Math.log(a)); break;
                    case 'log₂': stack.push(Math.log2(a)); break;
                    case 'sqrt': stack.push(Math.sqrt(a)); break;
                    case 'cbrt': stack.push(Math.cbrt(a)); break;
                    case 'abs': stack.push(Math.abs(a)); break;
                }
            }
        }
        
        if (stack.length !== 1) throw new Error("Invalid");
        return stack[0];
    }

    function factorial(n) {
        if (n < 0 || !Number.isInteger(n)) throw new Error();
        if (n === 0 || n === 1) return 1;
        let r = 1;
        for (let i = 2; i <= n; i++) r *= i;
        return r;
    }

    function fixFloatingPoint(n) {
        return Math.round(n * 1e12) / 1e12;
    }

    function formatNumber(n) {
        if (Math.abs(n) >= 1e10 || (Math.abs(n) < 1e-7 && n !== 0)) {
            return n.toExponential(5).replace('+', '');
        }
        let str = n.toString();
        let parts = str.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        return parts.join('.');
    }

    function adjustFontSize(element) {
        const len = element.textContent.length;
        if (len > 20) element.style.fontSize = '24px';
        else if (len > 12) element.style.fontSize = '32px';
        else element.style.fontSize = '48px';
    }

    // --- Interaction & Event Listeners ---
    function appendToExpression(val) {
        if (state.expression === 'Error') state.expression = '';
        state.expression += val;
        displayExpr.textContent = state.expression;
        evaluateExpression();
    }

    function removeLastChar() {
        if (state.expression === 'Error') state.expression = '';
        else state.expression = state.expression.slice(0, -1);
        displayExpr.textContent = state.expression;
        evaluateExpression();
    }

    function commitResult() {
        if (displayResult.textContent === 'Error' || !state.expression) return;
        
        let valStr = displayResult.textContent.replace(/,/g, '');
        let val = parseFloat(valStr);
        state.ans = val;
        
        // Add to history
        state.history.unshift({ expr: state.expression, res: displayResult.textContent });
        if(state.history.length > 20) state.history.pop();
        renderHistory();

        state.expression = valStr; // Prepare for chained calculations
        displayExpr.textContent = state.expression;
    }

    document.querySelectorAll('.btn-sci, .btn-num, .btn-op').forEach(btn => {
        btn.addEventListener('click', (e) => {
            createRipple(e, btn);
            if (btn.dataset.val) {
                appendToExpression(btn.dataset.val);
            }
        });
    });

    document.querySelectorAll('.btn-action, .btn-equals').forEach(btn => {
        btn.addEventListener('click', (e) => {
            createRipple(e, btn);
            let action = btn.dataset.action;
            if (action === 'AC') {
                state.expression = '';
                displayExpr.textContent = '';
                displayResult.textContent = '0';
            } else if (action === 'DEL') {
                removeLastChar();
            } else if (action === '=') {
                commitResult();
            } else if (action === '±') {
                appendToExpression('~'); // internal unary minus representation
            }
        });
    });

    // Memory Functions
    document.querySelectorAll('.memory-ops button').forEach(btn => {
        btn.addEventListener('click', () => {
            let act = btn.dataset.action;
            let currentVal = parseFloat(displayResult.textContent.replace(/,/g, '')) || 0;
            
            if (act === 'MC') state.memory = 0;
            if (act === 'MR') appendToExpression(state.memory.toString());
            if (act === 'M+') state.memory += currentVal;
            if (act === 'M-') state.memory -= currentVal;
            if (act === 'MS') state.memory = currentVal;
            
            memIndicator.classList.toggle('hidden', state.memory === 0);
        });
    });

    function renderHistory() {
        const list = document.getElementById('history-list');
        list.innerHTML = '';
        state.history.forEach(item => {
            const div = document.createElement('div');
            div.className = 'history-item';
            div.innerHTML = `<div class="hist-expr">${item.expr} =</div><div class="hist-res">${item.res}</div>`;
            div.addEventListener('click', () => {
                state.expression = item.expr;
                displayExpr.textContent = state.expression;
                evaluateExpression();
            });
            list.appendChild(div);
        });
    }

    // Ripple
    function createRipple(event, button) {
        if(window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const circle = document.createElement('span');
        const d = Math.max(button.clientWidth, button.clientHeight);
        const rect = button.getBoundingClientRect();
        
        let x = event.clientX - rect.left - d/2;
        let y = event.clientY - rect.top - d/2;
        if(event.clientX===0 && event.clientY===0) { x = button.clientWidth/2 - d/2; y = button.clientHeight/2 - d/2; }
        
        circle.style.width = circle.style.height = `${d}px`;
        circle.style.left = `${x}px`; circle.style.top = `${y}px`;
        circle.className = 'ripple';
        button.appendChild(circle);
        setTimeout(() => circle.remove(), 400);
    }

    // Keyboard
    document.addEventListener('keydown', (e) => {
        if(e.target.tagName === 'INPUT') return; // Ignore if typing in inputs
        if(['Enter','Backspace','Escape',' '].includes(e.key)) e.preventDefault();
        
        if(/[0-9.]/.test(e.key)) appendToExpression(e.key);
        else if(['+','-','*','/','(',')','^','%'].test(e.key)) {
            let key = e.key;
            if(key === '*') key = '×';
            if(key === '/') key = '÷';
            if(key === '-') key = '−';
            appendToExpression(key);
        }
        else if(e.key === 'Enter' || e.key === '=') commitResult();
        else if(e.key === 'Backspace') removeLastChar();
        else if(e.key === 'Escape') {
            state.expression = ''; displayExpr.textContent = ''; displayResult.textContent = '0';
        }
    });

    // --- PROGRAMMER MODE ---
    let progVal = 0n;
    const progBases = { HEX: 16, DEC: 10, OCT: 8, BIN: 2 };
    
    function updateProgDisplay() {
        document.getElementById('prog-hex').textContent = progVal.toString(16).toUpperCase();
        document.getElementById('prog-dec').textContent = progVal.toString(10);
        document.getElementById('prog-oct').textContent = progVal.toString(8);
        document.getElementById('prog-bin').textContent = progVal.toString(2);
        document.getElementById('prog-result').textContent = progVal.toString(progBases[state.progBase]).toUpperCase();
    }
    
    document.querySelectorAll('.base-row').forEach(row => {
        row.addEventListener('click', (e) => {
            document.querySelectorAll('.base-row').forEach(r => r.classList.remove('active'));
            const target = e.currentTarget;
            target.classList.add('active');
            state.progBase = target.dataset.base;
            
            // Toggle allowed keys
            const base = progBases[state.progBase];
            document.querySelectorAll('.prog-keys .btn-num').forEach(btn => {
                let v = btn.dataset.val;
                if(v) {
                    let num = parseInt(v, 16);
                    if(num < base) btn.classList.remove('disabled');
                    else btn.classList.add('disabled');
                }
            });
            updateProgDisplay();
        });
    });

    document.querySelectorAll('.prog-keys .btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.classList.contains('disabled')) return;
            let val = btn.dataset.val;
            let act = btn.dataset.action;
            
            if (val) {
                let currentStr = progVal.toString(progBases[state.progBase]);
                if (currentStr === '0') currentStr = '';
                try {
                    progVal = BigInt("0x" + (currentStr + val).toString(16)); // not accurate for other bases, let's fix
                    progVal = BigInt(parseInt(currentStr + val, progBases[state.progBase]));
                } catch(e){}
            } else if (act === 'AC') {
                progVal = 0n;
            } else if (act === 'DEL') {
                let currentStr = progVal.toString(progBases[state.progBase]);
                currentStr = currentStr.slice(0, -1) || '0';
                progVal = BigInt(parseInt(currentStr, progBases[state.progBase]));
            }
            updateProgDisplay();
        });
    });

    // Bitwise ops (simple version on BigInt)
    document.querySelectorAll('.prog-ops .btn').forEach(btn => {
        btn.addEventListener('click', () => {
            let op = btn.dataset.progOp;
            // A real calc would await second operand, simplified here to apply to itself or fixed values
            if(op === 'NOT') progVal = ~progVal;
            if(op === 'LSH') progVal = progVal << 1n;
            if(op === 'RSH') progVal = progVal >> 1n;
            updateProgDisplay();
        });
    });

    // --- STATISTICS MODE ---
    document.getElementById('stat-calc').addEventListener('click', () => {
        const input = document.getElementById('stat-input').value;
        const arr = input.split(',').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
        
        if (arr.length === 0) return;
        
        const n = arr.length;
        const sum = arr.reduce((a, b) => a + b, 0);
        const mean = sum / n;
        
        const sorted = [...arr].sort((a,b) => a-b);
        const median = n % 2 === 0 ? (sorted[n/2 - 1] + sorted[n/2]) / 2 : sorted[Math.floor(n/2)];
        
        const freq = {}; let maxF = 0; let mode = [];
        arr.forEach(val => { freq[val] = (freq[val] || 0) + 1; if(freq[val] > maxF) maxF = freq[val]; });
        for (let key in freq) if (freq[key] === maxF) mode.push(key);
        
        const min = sorted[0];
        const max = sorted[n-1];
        
        const variance = arr.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (n > 1 ? n - 1 : 1);
        const sd = Math.sqrt(variance);
        
        document.getElementById('stat-n').textContent = n;
        document.getElementById('stat-sum').textContent = fixFloatingPoint(sum);
        document.getElementById('stat-mean').textContent = fixFloatingPoint(mean);
        document.getElementById('stat-median').textContent = fixFloatingPoint(median);
        document.getElementById('stat-mode').textContent = mode.join(', ');
        document.getElementById('stat-min').textContent = min;
        document.getElementById('stat-max').textContent = max;
        document.getElementById('stat-range').textContent = fixFloatingPoint(max - min);
        document.getElementById('stat-var').textContent = fixFloatingPoint(variance);
        document.getElementById('stat-sd').textContent = fixFloatingPoint(sd);
    });

    document.getElementById('stat-clear').addEventListener('click', () => {
        document.getElementById('stat-input').value = '';
        document.querySelectorAll('.stat-card strong').forEach(el => el.textContent = '-');
    });

    // --- GRAPHING MODE ---
    let canvas, ctx;
    let graphConfig = { scale: 40, offsetX: 0, offsetY: 0 };
    
    function initGraph() {
        canvas = document.getElementById('graph-canvas');
        ctx = canvas.getContext('2d');
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
        drawGraph();
    }
    
    function resizeCanvas() {
        if(!canvas) return;
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
        graphConfig.offsetX = canvas.width / 2;
        graphConfig.offsetY = canvas.height / 2;
        drawGraph();
    }

    function drawGraph() {
        if(!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Grid
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        
        let cx = graphConfig.offsetX;
        let cy = graphConfig.offsetY;
        let scale = graphConfig.scale;

        ctx.beginPath();
        for(let x = cx % scale; x < canvas.width; x += scale) { ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); }
        for(let y = cy % scale; y < canvas.height; y += scale) { ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); }
        ctx.stroke();

        // Axes
        ctx.strokeStyle = 'rgba(109, 224, 194, 0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, cy); ctx.lineTo(canvas.width, cy);
        ctx.moveTo(cx, 0); ctx.lineTo(cx, canvas.height);
        ctx.stroke();

        // Plot Function
        const expr = document.getElementById('graph-input').value;
        if(!expr) return;

        try {
            let tokens = tokenize(expr);
            let postfix = infixToPostfix(tokens);
            
            ctx.strokeStyle = '#6DE0C2';
            ctx.lineWidth = 2;
            ctx.beginPath();
            
            let first = true;
            for(let px = 0; px < canvas.width; px++) {
                let x = (px - cx) / scale;
                let y = evaluatePostfix(postfix, x);
                let py = cy - (y * scale);
                
                if(isNaN(py) || Math.abs(py) > 10000) { first = true; continue; }
                
                if(first) { ctx.moveTo(px, py); first = false; } 
                else ctx.lineTo(px, py);
            }
            ctx.stroke();
        } catch(e) {}
    }

    document.getElementById('graph-plot').addEventListener('click', drawGraph);
    document.getElementById('graph-input').addEventListener('input', drawGraph);
    
    document.getElementById('graph-zoom-in').addEventListener('click', () => { graphConfig.scale *= 1.5; drawGraph(); });
    document.getElementById('graph-zoom-out').addEventListener('click', () => { graphConfig.scale /= 1.5; drawGraph(); });
    document.getElementById('graph-reset').addEventListener('click', () => {
        graphConfig.scale = 40; resizeCanvas();
    });

    // Panning
    let isDragging = false;
    let lastX, lastY;
    if(canvas) {
        canvas.addEventListener('mousedown', (e) => { isDragging = true; lastX = e.clientX; lastY = e.clientY; });
        canvas.addEventListener('mousemove', (e) => {
            if(!isDragging) return;
            graphConfig.offsetX += e.clientX - lastX;
            graphConfig.offsetY += e.clientY - lastY;
            lastX = e.clientX; lastY = e.clientY;
            drawGraph();
        });
        canvas.addEventListener('mouseup', () => isDragging = false);
        canvas.addEventListener('mouseleave', () => isDragging = false);
    }
});
