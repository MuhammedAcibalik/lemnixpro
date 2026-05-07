import unittest

from app.domain.color_policy import ColorClass, classify, policy_for


class ClassifyTests(unittest.TestCase):
    def test_painted_explicit_codes(self) -> None:
        for value in ["R9005", "RAL9005", "RAL 9003", "PRES KIRMIZI", "RAL"]:
            self.assertEqual(classify(value), ColorClass.PAINTED, value)

    def test_anodized_codes(self) -> None:
        for value in ["ELS", "eloksal", "ANODIZE", "ELOX FOO", "Eloxal Black"]:
            self.assertEqual(classify(value), ColorClass.ANODIZED, value)

    def test_blank_or_none_falls_back_to_painted(self) -> None:
        self.assertEqual(classify(None), ColorClass.PAINTED)
        self.assertEqual(classify(""), ColorClass.PAINTED)
        self.assertEqual(classify("   "), ColorClass.PAINTED)

    def test_unknown_falls_back_to_painted(self) -> None:
        self.assertEqual(classify("ROBOTIC PURPLE"), ColorClass.PAINTED)


class PolicyTests(unittest.TestCase):
    def test_painted_policy(self) -> None:
        policy = policy_for("RAL9005")
        self.assertEqual(policy.front_trim_mm, 10)
        self.assertEqual(policy.end_trim_mm, 0)
        self.assertEqual(policy.total_trim_mm, 10)

    def test_anodized_policy(self) -> None:
        policy = policy_for("ELS")
        self.assertEqual(policy.front_trim_mm, 50)
        self.assertEqual(policy.end_trim_mm, 50)
        self.assertEqual(policy.total_trim_mm, 100)


if __name__ == "__main__":
    unittest.main()
