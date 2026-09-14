return {
  -- Golden order is hand-reviewed: proc promotes, missing inputs skip, duplicate actions collapse.
  { name = "ordinary", energy = 20, proc = false, expected = "neutral.strike,neutral.filler" },
  { name = "proc", energy = 60, proc = true, expected = "neutral.burst,neutral.strike,neutral.filler" },
  { name = "no_proc", energy = 60, proc = false, expected = "neutral.strike,neutral.filler" },
  { name = "restricted", energy = 60, proc = true, restricted = true, expected = "neutral.strike,neutral.filler" },
}
