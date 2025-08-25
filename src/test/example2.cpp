// save as sample.cpp
#include <vector>
#include <cmath>
#include <cstdint>

// Likely to be inlined / not inlined depending on thresholds
static inline int small_add(int x) {
    return x + 1;
}

// Large-ish function to discourage inlining
__attribute__((noinline))
int heavy_calc(const std::vector<float>& v) {
    int s = 0;
    for (size_t i = 0; i < v.size(); ++i) {
        // non-trivial math to affect vectorization decisions
        s += static_cast<int>(std::sqrt(std::fabs(v[i])) * 3.14159f);
    }
    return s;
}

// A loop that might vectorize/unroll
int sum_scaled(int *a, int n) {
    int acc = 0;
    // Dependence/stride patterns may trigger vectorization remarks
    for (int i = 0; i < n; ++i) {
        acc += a[i] * (i & 3 ? 2 : 3);
    }
    return acc;
}

int main() {
    std::vector<float> v(1000);
    for (int i = 0; i < 1000; ++i) v[i] = (i % 7) - 3.5f;

    int arr[1024];
    for (int i = 0; i < 1024; ++i) arr[i] = i;

    int x = small_add(41);
    int y = heavy_calc(v);
    int z = sum_scaled(arr, 1024);
    return x + y + z;
}
