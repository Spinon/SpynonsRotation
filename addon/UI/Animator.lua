local _, Spynon = ...
local Animator = {}
Animator.Duration = { MOVE = 0.16, ENTER = 0.18, EXIT = 0.12, PROMOTE = 0.22, CONSUME = 0.10 }
local function copy(value)
  local result = {}
  for key, item in pairs(value) do result[key] = item end
  return result
end
local function mix(a, b, progress)
  local value = {}
  for key, target in pairs(b) do value[key] = a[key] + (target - a[key]) * progress end
  return value
end
function Animator.Classify(previous, position)
  if not position then return "EXIT" end
  if not previous then return "ENTER" end
  if position == 1 and previous ~= 1 then return "PROMOTE" end
  if position ~= previous then return "MOVE" end
  return nil
end

-- One shared clock per view. All coordinates are local, public UI geometry.
function Animator.Create(paint, release, wake)
  local animator, tracks, mode = {}, {}, "NORMAL"
  local durations, curves = copy(Animator.Duration), {}
  function animator.Configure(_, values)
    if not Spynon.SettingsFactory.Validate(values) then return false end
    for kind, prefix in pairs({ MOVE="move", ENTER="enter", EXIT="exit", PROMOTE="promote", CONSUME="consume" }) do
      durations[kind] = values[prefix .. "Duration"] / 1000
      curves[kind] = values[prefix .. "Curve"] or "CUBIC"
    end
    return true
  end
  function animator.SetMode(_, value)
    if value ~= "NORMAL" and value ~= "REDUCED" and value ~= "OFF" then return false end
    animator:Finish()
    mode = value
    return true
  end
  function animator.GetMode(_) return mode end
  function animator.Cancel(_, slot) tracks[slot] = nil end
  function animator.Animate(_, slot, target, kind, retiring, delay)
    local from = copy(slot.visual or target)
    local duration = durations[kind] or 0
    if kind == "ENTER" and not slot.visual then
      from.alpha = 0
      if mode == "NORMAL" then from.x = from.x + from.width * 0.25; from.scale = 0.96 end
    end
    if retiring then
      target = copy(from)
      target.alpha = 0
      if mode == "NORMAL" then target.scale = kind == "CONSUME" and 0.96 or 0.94 end
    end
    if mode == "OFF" then duration = 0
    elseif mode == "REDUCED" then
      duration = kind == "MOVE" and 0 or math.min(duration, 0.10)
      if not retiring then
        -- Promotion crossfades at the old/new anchors; no long spatial travel.
        if kind ~= "PROMOTE" then from = copy(target); from.alpha = kind == "ENTER" and 0 or target.alpha end
      end
    end
    if duration == 0 then
      tracks[slot] = nil; slot.visual = copy(target); paint(slot)
      if retiring then release(slot) end
      return
    end
    tracks[slot] = { from = from, target = copy(target), time = mode == "NORMAL" and -(delay or 0) or 0,
      duration = duration, curve = curves[kind] or "CUBIC",
      kind = kind, retiring = retiring, crossfade = mode == "REDUCED" and kind == "PROMOTE" }
    slot.visual = from; paint(slot); wake(true)
  end
  function animator.Consume(_, slot)
    if mode == "OFF" then return false end
    -- A local accent is independent of an in-flight spatial transition.
    slot.consumeTime = 0
    slot.consumeDuration = mode == "REDUCED" and math.min(durations.CONSUME, 0.10) or durations.CONSUME
    wake(true)
    return true
  end
  function animator.Step(_, elapsed, slots)
    if type(elapsed) ~= "number" or elapsed ~= elapsed or elapsed < 0 or elapsed == math.huge then return end
    local active = false
    for _, slot in ipairs(slots) do
      local track = tracks[slot]
      if track then
        track.time = math.min(track.duration, track.time + elapsed)
        local t = math.max(0, track.time / track.duration)
        if track.crossfade then
          slot.visual = copy(t < 0.5 and track.from or track.target)
          slot.visual.alpha = t < 0.5 and track.from.alpha * (1 - t * 2) or (t * 2 - 1) * track.target.alpha
        else
          local progress = track.curve == "LINEAR" and t
            or (track.curve == "SMOOTH" and t*t*(3-2*t) or 1 - (1 - t) ^ 3)
          slot.visual = mix(track.from, track.target, progress)
        end
        if t == 1 then tracks[slot] = nil else active = true end
      end
      if slot.consumeTime then
        slot.consumeTime = slot.consumeTime + elapsed
        if slot.consumeTime >= (slot.consumeDuration or durations.CONSUME) then slot.consumeTime = nil
        else active = true end
      end
      if slot.visual then paint(slot) end
      if track and track.time == track.duration and track.retiring then release(slot) end
    end
    wake(active)
  end
  function animator.Finish(_)
    local pending = tracks
    tracks = {}
    for slot, track in pairs(pending) do
      slot.visual = copy(track.target); slot.consumeTime = nil; paint(slot)
      if track.retiring then release(slot) end
    end
    wake(false)
  end
  function animator.GetTransition(_, slot) return tracks[slot] and tracks[slot].kind or nil end
  return animator
end
Spynon.AnimatorFactory = Animator
