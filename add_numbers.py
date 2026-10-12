import sys

def add(a, b):
    return a + b

if __name__ == "__main__":
    x = float(sys.argv[1]) if len(sys.argv) > 1 else 12
    y = float(sys.argv[2]) if len(sys.argv) > 2 else 8
    print(f"{x} + {y} = {add(x, y)}")
