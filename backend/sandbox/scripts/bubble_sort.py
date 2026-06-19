"""冒泡排序（Bubble Sort）示例程序"""


def bubble_sort(arr: list) -> list:
    """对列表进行升序冒泡排序，返回排序后的新列表。

    时间复杂度：O(n^2)
    空间复杂度：O(1)（原地排序，这里为不修改原列表做了拷贝）
    """
    # 拷贝一份，避免修改原始数据
    nums = arr[:]
    n = len(nums)

    for i in range(n - 1):
        swapped = False  # 优化：若本轮没有发生交换，说明已有序，可提前结束
        for j in range(n - 1 - i):
            if nums[j] > nums[j + 1]:
                nums[j], nums[j + 1] = nums[j + 1], nums[j]
                swapped = True
        if not swapped:
            break

    return nums


def main():
    data = [64, 34, 25, 12, 22, 11, 90]
    print("排序前：", data)
    print("排序后：", bubble_sort(data))
    # 原列表不受影响
    print("原列表：", data)


if __name__ == "__main__":
    main()
