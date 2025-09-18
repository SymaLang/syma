#!/bin/bash

# Build a specific demo
# Usage: ./build-demo.sh <demo-name>
# Example: ./build-demo.sh counter

DEMO=$1

if [ -z "$DEMO" ]; then
    echo "Usage: ./build-demo.sh <demo-name>"
    echo "Available demos: counter, todo, effects, brainfuck"
    exit 1
fi

case $DEMO in
    counter)
        echo "Building Counter demo..."
        node scripts/syma-modules.js src/demos/counter.syma --bundle --entry Demo/Counter --out public/universe.json --pretty
        ;;
    todo)
        echo "Building Todo List demo..."
        node scripts/syma-modules.js src/demos/todo.syma --bundle --entry Demo/TodoList --out public/universe.json --pretty
        ;;
    effects)
        echo "Building Effects demo..."
        node scripts/syma-modules.js src/demos/effects-demo.syma --bundle --entry Demo/Effects --out public/universe.json --pretty
        ;;
    brainfuck|bf)
        echo "Building Brainfuck Interpreter demo..."
        node scripts/syma-modules.js src/demos/bf.syma --bundle --entry Demo/Brainfuck --out public/universe.json --pretty
        ;;
    *)
        echo "Unknown demo: $DEMO"
        echo "Available demos: counter, todo, effects, brainfuck"
        exit 1
        ;;
esac

echo "✅ Demo built successfully! Run 'npm run dev' to view it."