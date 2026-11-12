# Dropdown definition coverage

Page's output reports `definitions-select-count` with one visible select. It does not report the number or type of definitions. Therefore it proves a cardinality mismatch, not which extra component caused it.

The old reader compared all question definitions with visible selects and required every definition to be a dropdown. Public chunk606 ComponentStateFactory includes non-answer companions in the same definitions collection: SOUND_COMPONENT and ANNOTATED_TEXT_COMPONENT. SoundComponent sets isInput=false and returns score1/max1/weight0. AnnotatedTextComponent sets isInput=false and marked=NOT_MARKED; enum module9935 marks NOT_MARKED=2. Neither accepts a response. ComponentIndex registers their builder instances by ID alongside dropdown instances.

The replacement compares dropdown definitions with selects while retaining complete definition/cache coverage. It supports only these two known companion types after validating exact definition/metadata equality, cached type/id/state, isInput=false, marking enum, question render mode, visible in-question element, and no editable/nested-dropdown/embedded frame controls. Unknown or answer-bearing definitions still stop before input. Companion identities join every baseline re-read; metadata is included in the existing signature. No output, parser, player or annotation helper is invoked.

The failing cardinality diagnostic now includes bounded numeric counts for definitions, dropdowns, recognized companions and unsupported definitions. It contains no component IDs, types, question text or answers. A future unsupported mismatch is actionable without guessing.

Offline evidence only: new synthetic fixtures reproduce the old exact guard with one select plus a companion; new reader fills/submits once after normal CLI approval. This is not proof of the makeup of Page's actual slide. Assessment refusal and full exact-answer final checks remain in force.

Source: https://mfe-student-app.educationperfect.com/main/mfe-hashed-assets-606-c22c0eb5e341ef24b769.js
SHA256 e72b68b8c06508dbfdef365f2bb8edf23bc2085c077acb48c32c5f40a934352a
