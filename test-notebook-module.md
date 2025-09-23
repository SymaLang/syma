# Testing Notebook Module System

## Test 1: Define a Simple Module

```syma
:module multiline
{Module Math/Extra
  {Export Square Cube}
  {Defs
    {Square {Mul _}}
    {Cube {Mul _ {Mul _}}}
  }
  {Rules
    {R "Square/Apply" {Square n_} {Mul n_ n_} 500}
    {R "Cube/Apply" {Cube n_} {Mul n_ {Mul n_ n_}} 500}
  }
}
:end
```

## Test 2: Import and Use the Module

```syma
:import Math/Extra
{Math/Extra/Square 5}
```

Expected output: 25

## Test 3: Import with Open

```syma
:import Math/Extra open
{Square 7}
```

Expected output: 49

## Test 4: Module with Dependencies

```syma
:module multiline
{Module App/Counter
  {Export Inc Dec Reset}
  {Import Core/List as List}
  {Rules
    {R "Inc" {Apply Inc {State {Count n_}}} {State {Count {Add n_ 1}}} 100}
    {R "Dec" {Apply Dec {State {Count n_}}} {State {Count {Sub n_ 1}}} 100}
    {R "Reset" {Apply Reset _} {State {Count 0}} 100}
  }
}
:end
```

## Test 5: Use in Rendering

```syma
:import App/Counter

:render watch multiline
{Div
  {H2 "Counter Module Test"}
  {P "Count: " {Show Count}}
  {Button :onClick Inc "Increment"}
  {Button :onClick Dec "Decrement"}
  {Button :onClick Reset "Reset"}
}
:end
```

This demonstrates that notebook modules can:
1. Define exports
2. Define rules
3. Import other modules
4. Be imported with open/macro modifiers
5. Work with the watch rendering system