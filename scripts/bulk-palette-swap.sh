#!/usr/bin/env bash
# Bulk palette swap across remaining app/** pages.
# Hand-applied surfaces are excluded — we don't want to undo the bespoke work.
#
# Each substitution maps a stock Tailwind token to its Edukids equivalent.
# Order matters: more specific patterns must come before broader ones.
set -euo pipefail

# Files to operate on: every app/**/*.tsx EXCEPT the polished ones.
mapfile -t TARGETS < <(
  find app -name "*.tsx" -type f \
    ! -path "app/page.tsx" \
    ! -path "app/auth/*" \
    ! -path "app/students/dashboard/page.tsx" \
    ! -path "app/teachers/dashboard/page.tsx" \
    ! -path "app/sponsors/dashboard/page.tsx" \
)

echo "Will rewrite ${#TARGETS[@]} files."

# ---- The substitution table ----
# Use a single sed -i with multiple -e expressions for atomic per-file edits.
SED_EXPR=(
  # Page backgrounds
  -e 's/\bbg-gray-50\b/bg-cream-100/g'
  -e 's/\bbg-gray-100\b/bg-cream-100/g'

  # Surface neutrals
  -e 's/\bbg-white\/95\b/bg-cream-50\/95/g'
  -e 's/\bbg-white\b/bg-cream-50/g'

  # Text grays (espresso scale)
  -e 's/\btext-gray-900\b/text-espresso/g'
  -e 's/\btext-gray-800\b/text-espresso/g'
  -e 's/\btext-gray-700\b/text-espresso/g'
  -e 's/\btext-gray-600\b/text-espresso\/70/g'
  -e 's/\btext-gray-500\b/text-espresso\/55/g'
  -e 's/\btext-gray-400\b/text-espresso\/45/g'
  -e 's/\btext-gray-300\b/text-espresso\/30/g'

  # Borders
  -e 's/\bborder-gray-100\b/border-espresso\/10/g'
  -e 's/\bborder-gray-200\b/border-espresso\/15/g'
  -e 's/\bborder-gray-300\b/border-espresso\/20/g'

  # Hover/active surfaces
  -e 's/\bhover:bg-gray-50\b/hover:bg-cream-100/g'
  -e 's/\bhover:bg-gray-100\b/hover:bg-cream-100/g'

  # Blue → terracotta (primary actions on most existing pages)
  -e 's/\bbg-blue-50\b/bg-terracotta\/10/g'
  -e 's/\bbg-blue-100\b/bg-terracotta\/15/g'
  -e 's/\bbg-blue-600\b/bg-terracotta/g'
  -e 's/\bbg-blue-700\b/bg-terracotta-500/g'
  -e 's/\bhover:bg-blue-700\b/hover:bg-terracotta-500/g'
  -e 's/\btext-blue-600\b/text-terracotta/g'
  -e 's/\btext-blue-700\b/text-terracotta-500/g'
  -e 's/\btext-blue-800\b/text-terracotta-500/g'
  -e 's/\bborder-blue-200\b/border-terracotta\/30/g'
  -e 's/\bborder-blue-500\b/border-terracotta/g'
  -e 's/\bring-blue-500\b/ring-terracotta/g'
  -e 's/\bfocus:ring-blue-500\b/focus:ring-terracotta/g'
  -e 's/\bfocus:border-blue-500\b/focus:border-terracotta/g'

  # Indigo (variant of "primary" elsewhere) → terracotta
  -e 's/\bbg-indigo-50\b/bg-terracotta\/10/g'
  -e 's/\bbg-indigo-600\b/bg-terracotta/g'
  -e 's/\btext-indigo-600\b/text-terracotta/g'
  -e 's/\btext-indigo-700\b/text-terracotta-500/g'
  -e 's/\btext-indigo-800\b/text-terracotta-500/g'
  -e 's/\bborder-indigo-200\b/border-terracotta\/30/g'

  # Green / emerald → forest (success / completion)
  -e 's/\bbg-green-50\b/bg-forest\/10/g'
  -e 's/\bbg-green-100\b/bg-forest\/15/g'
  -e 's/\bbg-green-600\b/bg-forest/g'
  -e 's/\bbg-green-700\b/bg-forest-400/g'
  -e 's/\bhover:bg-green-700\b/hover:bg-forest-400/g'
  -e 's/\btext-green-600\b/text-forest/g'
  -e 's/\btext-green-700\b/text-forest-500/g'
  -e 's/\btext-green-800\b/text-forest-500/g'
  -e 's/\bborder-green-200\b/border-forest\/30/g'
  -e 's/\bbg-emerald-50\b/bg-forest\/10/g'
  -e 's/\bbg-emerald-600\b/bg-forest/g'
  -e 's/\bbg-emerald-700\b/bg-forest-400/g'
  -e 's/\btext-emerald-600\b/text-forest/g'
  -e 's/\btext-emerald-700\b/text-forest-500/g'
  -e 's/\bborder-emerald-200\b/border-forest\/30/g'

  # Yellow / amber → mustard (warning / spotlight)
  -e 's/\bbg-yellow-50\b/bg-mustard\/15/g'
  -e 's/\bbg-yellow-100\b/bg-mustard\/20/g'
  -e 's/\bbg-yellow-600\b/bg-mustard-400/g'
  -e 's/\btext-yellow-600\b/text-mustard-500/g'
  -e 's/\btext-yellow-700\b/text-mustard-500/g'
  -e 's/\btext-yellow-800\b/text-mustard-500/g'
  -e 's/\bborder-yellow-200\b/border-mustard\/40/g'
  -e 's/\bbg-amber-50\b/bg-mustard\/15/g'
  -e 's/\bbg-amber-100\b/bg-mustard\/20/g'
  -e 's/\btext-amber-600\b/text-mustard-500/g'
  -e 's/\btext-amber-700\b/text-mustard-500/g'
  -e 's/\tborder-amber-200\b/border-mustard\/40/g'

  # Red / rose → coral (destructive)
  -e 's/\bbg-red-50\b/bg-coral\/10/g'
  -e 's/\bbg-red-100\b/bg-coral\/15/g'
  -e 's/\bbg-red-600\b/bg-coral/g'
  -e 's/\bbg-red-700\b/bg-coral-400/g'
  -e 's/\bhover:bg-red-700\b/hover:bg-coral-400/g'
  -e 's/\btext-red-600\b/text-coral/g'
  -e 's/\btext-red-700\b/text-coral/g'
  -e 's/\btext-red-800\b/text-coral/g'
  -e 's/\bborder-red-200\b/border-coral\/30/g'
  -e 's/\bborder-red-400\b/border-coral/g'
  -e 's/\bbg-rose-50\b/bg-mustard\/15/g'
  -e 's/\bbg-rose-600\b/bg-mustard-400/g'
  -e 's/\btext-rose-600\b/text-mustard-500/g'
  -e 's/\btext-rose-700\b/text-mustard-500/g'

  # Purple → coral (a few pages used purple for "special")
  -e 's/\bbg-purple-50\b/bg-coral\/10/g'
  -e 's/\bbg-purple-100\b/bg-coral\/15/g'
  -e 's/\btext-purple-600\b/text-coral/g'
  -e 's/\btext-purple-700\b/text-coral/g'

  # Orange → terracotta (mid-warm accent)
  -e 's/\bbg-orange-50\b/bg-terracotta\/10/g'
  -e 's/\btext-orange-600\b/text-terracotta/g'
)

# Apply.
for f in "${TARGETS[@]}"; do
  sed -i "${SED_EXPR[@]}" "$f"
done

echo "Done."
