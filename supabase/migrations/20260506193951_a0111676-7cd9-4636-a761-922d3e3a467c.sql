
-- Nutrition: meal logs
CREATE TABLE public.meal_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  calories INTEGER,
  protein_g NUMERIC,
  carbs_g NUMERIC,
  fat_g NUMERIC,
  meal_type TEXT,
  notes TEXT,
  eaten_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.meal_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_meals_all ON public.meal_logs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_meal_logs_user_date ON public.meal_logs(user_id, eaten_at DESC);

-- Track AI program adjustments (audit trail + UI)
CREATE TABLE public.program_adjustments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  program_id UUID,
  workout_id UUID,
  trigger TEXT NOT NULL, -- 'workout_complete' | 'video_analysis' | 'checkin' | 'manual'
  summary TEXT NOT NULL,
  changes JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.program_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_adj_all ON public.program_adjustments FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Macro targets on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS macro_targets JSONB;

-- Seed exercise library (110+)
INSERT INTO public.exercises (name, category, primary_muscles, secondary_muscles, equipment, instructions, video_url) VALUES
-- CHEST
('Barbell Bench Press','strength',ARRAY['chest'],ARRAY['triceps','front delts'],ARRAY['barbell','bench'],'Lie on bench, grip just outside shoulders, lower bar to mid-chest, press up.','https://www.youtube.com/watch?v=rT7DgCr-3pg'),
('Incline Dumbbell Press','strength',ARRAY['upper chest'],ARRAY['front delts','triceps'],ARRAY['dumbbells','bench'],'Set bench 30°, press dumbbells from shoulder level to lockout.','https://www.youtube.com/watch?v=8iPEnn-ltC8'),
('Dumbbell Bench Press','strength',ARRAY['chest'],ARRAY['triceps','delts'],ARRAY['dumbbells','bench'],'Press dumbbells from chest to overhead with controlled descent.','https://www.youtube.com/watch?v=QsYre__-aro'),
('Push-Up','bodyweight',ARRAY['chest'],ARRAY['triceps','core'],ARRAY['bodyweight'],'Plank, lower chest to floor, press up. Keep core tight.','https://www.youtube.com/watch?v=IODxDxX7oi4'),
('Dumbbell Fly','strength',ARRAY['chest'],ARRAY['front delts'],ARRAY['dumbbells','bench'],'Slight elbow bend, open arms wide, squeeze chest to bring up.','https://www.youtube.com/watch?v=eozdVDA78K0'),
('Cable Crossover','strength',ARRAY['chest'],ARRAY['front delts'],ARRAY['cable'],'Hands high, sweep across body squeezing chest.','https://www.youtube.com/watch?v=taI4XduLpTk'),
('Dips','bodyweight',ARRAY['lower chest'],ARRAY['triceps','front delts'],ARRAY['dip bars'],'Lean forward slightly, lower until shoulders below elbows, press up.','https://www.youtube.com/watch?v=2z8JmcrW-As'),
('Decline Push-Up','bodyweight',ARRAY['upper chest'],ARRAY['triceps'],ARRAY['bodyweight'],'Feet elevated, perform push-up.','https://www.youtube.com/watch?v=SKPab2YC8BE'),
('Machine Chest Press','strength',ARRAY['chest'],ARRAY['triceps','delts'],ARRAY['machine'],'Press handles from chest level to lockout.','https://www.youtube.com/watch?v=xUm0BiZCWlQ'),
-- BACK
('Deadlift','strength',ARRAY['back','hamstrings','glutes'],ARRAY['traps','forearms','core'],ARRAY['barbell'],'Hip-hinge, neutral spine, drive floor away, lock hips at top.','https://www.youtube.com/watch?v=op9kVnSso6Q'),
('Pull-Up','bodyweight',ARRAY['lats'],ARRAY['biceps','rear delts'],ARRAY['pull-up bar'],'Hang, pull chest to bar, control descent.','https://www.youtube.com/watch?v=eGo4IYlbE5g'),
('Chin-Up','bodyweight',ARRAY['lats','biceps'],ARRAY['rear delts'],ARRAY['pull-up bar'],'Underhand grip, pull chin over bar.','https://www.youtube.com/watch?v=brhRXlOhsAM'),
('Bent-Over Barbell Row','strength',ARRAY['back'],ARRAY['biceps','rear delts'],ARRAY['barbell'],'Hinge to 45°, row bar to lower chest, squeeze shoulder blades.','https://www.youtube.com/watch?v=FWJR5Ve8bnQ'),
('Dumbbell Row','strength',ARRAY['lats','mid back'],ARRAY['biceps'],ARRAY['dumbbells','bench'],'One knee on bench, row dumbbell to hip.','https://www.youtube.com/watch?v=pYcpY20QaE8'),
('Lat Pulldown','strength',ARRAY['lats'],ARRAY['biceps','rear delts'],ARRAY['cable'],'Pull bar to upper chest, lead with elbows.','https://www.youtube.com/watch?v=CAwf7n6Luuc'),
('Seated Cable Row','strength',ARRAY['mid back'],ARRAY['lats','biceps'],ARRAY['cable'],'Row handle to belly, drive elbows back.','https://www.youtube.com/watch?v=GZbfZ033f74'),
('T-Bar Row','strength',ARRAY['mid back'],ARRAY['lats','biceps'],ARRAY['barbell'],'Hinge over bar, row to chest.','https://www.youtube.com/watch?v=j3Igk5nyZE4'),
('Face Pull','strength',ARRAY['rear delts'],ARRAY['traps','rotator cuff'],ARRAY['cable'],'Rope to forehead, elbows high, externally rotate.','https://www.youtube.com/watch?v=rep-qVOkqgk'),
('Inverted Row','bodyweight',ARRAY['mid back'],ARRAY['biceps'],ARRAY['barbell','rings'],'Body straight, pull chest to bar.','https://www.youtube.com/watch?v=KOaCM1HMscs'),
('Romanian Deadlift','strength',ARRAY['hamstrings','glutes'],ARRAY['back'],ARRAY['barbell','dumbbells'],'Hinge with soft knees, bar slides down legs to mid-shin.','https://www.youtube.com/watch?v=jEy_czb3RKA'),
('Hyperextension','bodyweight',ARRAY['lower back','glutes'],ARRAY['hamstrings'],ARRAY['hyper bench'],'Hinge over pad, raise torso to neutral.','https://www.youtube.com/watch?v=ph3pddpKzzw'),
-- LEGS
('Back Squat','strength',ARRAY['quads','glutes'],ARRAY['hamstrings','core'],ARRAY['barbell','rack'],'Bar on upper traps, descend to parallel, drive up.','https://www.youtube.com/watch?v=ultWZbUMPL8'),
('Front Squat','strength',ARRAY['quads'],ARRAY['core','upper back'],ARRAY['barbell','rack'],'Bar on front delts, elbows high, squat upright.','https://www.youtube.com/watch?v=tlfahNdNPPI'),
('Goblet Squat','strength',ARRAY['quads','glutes'],ARRAY['core'],ARRAY['dumbbell','kettlebell'],'Hold weight at chest, squat deep.','https://www.youtube.com/watch?v=MeIiIdhvXT4'),
('Bulgarian Split Squat','strength',ARRAY['quads','glutes'],ARRAY['hamstrings'],ARRAY['dumbbells','bench'],'Rear foot on bench, descend on front leg.','https://www.youtube.com/watch?v=2C-uNgKwPLE'),
('Leg Press','strength',ARRAY['quads','glutes'],ARRAY['hamstrings'],ARRAY['machine'],'Feet shoulder-width, lower until knees ~90°.','https://www.youtube.com/watch?v=IZxyjW7MPJQ'),
('Walking Lunge','strength',ARRAY['quads','glutes'],ARRAY['hamstrings'],ARRAY['dumbbells','bodyweight'],'Step forward, knee just above floor, drive through front heel.','https://www.youtube.com/watch?v=L8fvypPrzzs'),
('Leg Curl','strength',ARRAY['hamstrings'],ARRAY['calves'],ARRAY['machine'],'Curl heels toward glutes.','https://www.youtube.com/watch?v=1Tq3QdYUuHs'),
('Leg Extension','strength',ARRAY['quads'],ARRAY[]::text[],ARRAY['machine'],'Extend knees fully, control eccentric.','https://www.youtube.com/watch?v=YyvSfVjQeL0'),
('Hip Thrust','strength',ARRAY['glutes'],ARRAY['hamstrings'],ARRAY['barbell','bench'],'Upper back on bench, drive hips up to lockout.','https://www.youtube.com/watch?v=LM8XHLYJoYs'),
('Glute Bridge','bodyweight',ARRAY['glutes'],ARRAY['hamstrings'],ARRAY['bodyweight'],'Drive hips up, squeeze glutes at top.','https://www.youtube.com/watch?v=OUgsJ8-Vi0E'),
('Calf Raise','strength',ARRAY['calves'],ARRAY[]::text[],ARRAY['bodyweight','dumbbells','machine'],'Rise onto balls of feet, full stretch and contraction.','https://www.youtube.com/watch?v=gwLzBJYoWlI'),
('Step-Up','bodyweight',ARRAY['quads','glutes'],ARRAY['hamstrings'],ARRAY['bench','dumbbells'],'Step onto box, drive through full foot.','https://www.youtube.com/watch?v=dQqApCGd5Ss'),
('Sumo Deadlift','strength',ARRAY['glutes','quads'],ARRAY['back'],ARRAY['barbell'],'Wide stance, hands inside knees, drive floor away.','https://www.youtube.com/watch?v=wYREQkVtvEc'),
-- SHOULDERS
('Overhead Press','strength',ARRAY['shoulders'],ARRAY['triceps','core'],ARRAY['barbell'],'Bar at front delts, press to lockout overhead.','https://www.youtube.com/watch?v=2yjwXTZQDDI'),
('Dumbbell Shoulder Press','strength',ARRAY['shoulders'],ARRAY['triceps'],ARRAY['dumbbells'],'Press dumbbells from shoulder level overhead.','https://www.youtube.com/watch?v=qEwKCR5JCog'),
('Lateral Raise','strength',ARRAY['side delts'],ARRAY[]::text[],ARRAY['dumbbells'],'Raise arms to shoulder height, slight elbow bend.','https://www.youtube.com/watch?v=3VcKaXpzqRo'),
('Front Raise','strength',ARRAY['front delts'],ARRAY[]::text[],ARRAY['dumbbells'],'Raise arms forward to shoulder height.','https://www.youtube.com/watch?v=-t7fuZ0KhDA'),
('Rear Delt Fly','strength',ARRAY['rear delts'],ARRAY['traps'],ARRAY['dumbbells'],'Hinge over, raise arms wide.','https://www.youtube.com/watch?v=ttvfGg9d76c'),
('Arnold Press','strength',ARRAY['shoulders'],ARRAY['triceps'],ARRAY['dumbbells'],'Rotate from supinated to pronated as you press.','https://www.youtube.com/watch?v=6Z15_WdXmVw'),
('Upright Row','strength',ARRAY['side delts','traps'],ARRAY[]::text[],ARRAY['barbell','dumbbells'],'Pull to chest height, elbows lead.','https://www.youtube.com/watch?v=amCU-ziHITM'),
('Shrug','strength',ARRAY['traps'],ARRAY[]::text[],ARRAY['dumbbells','barbell'],'Elevate shoulders to ears, hold briefly.','https://www.youtube.com/watch?v=g6qbq4Lf1FI'),
('Pike Push-Up','bodyweight',ARRAY['shoulders'],ARRAY['triceps'],ARRAY['bodyweight'],'Hips high, lower head to floor.','https://www.youtube.com/watch?v=x7_Q5RixA-c'),
-- ARMS
('Barbell Curl','strength',ARRAY['biceps'],ARRAY['forearms'],ARRAY['barbell'],'Curl bar to shoulders, elbows pinned.','https://www.youtube.com/watch?v=kwG2ipFRgfo'),
('Dumbbell Curl','strength',ARRAY['biceps'],ARRAY['forearms'],ARRAY['dumbbells'],'Alternate curls, supinate at top.','https://www.youtube.com/watch?v=ykJmrZ5v0Oo'),
('Hammer Curl','strength',ARRAY['biceps','brachialis'],ARRAY['forearms'],ARRAY['dumbbells'],'Neutral grip curl.','https://www.youtube.com/watch?v=zC3nLlEvin4'),
('Preacher Curl','strength',ARRAY['biceps'],ARRAY[]::text[],ARRAY['barbell','machine'],'Arms on pad, curl with strict form.','https://www.youtube.com/watch?v=fIWP-FRFNU0'),
('Cable Curl','strength',ARRAY['biceps'],ARRAY[]::text[],ARRAY['cable'],'Curl handle, keep elbows still.','https://www.youtube.com/watch?v=NFzTWp2qpiE'),
('Triceps Pushdown','strength',ARRAY['triceps'],ARRAY[]::text[],ARRAY['cable'],'Press handle down, lock out elbows.','https://www.youtube.com/watch?v=2-LAMcpzODU'),
('Overhead Triceps Extension','strength',ARRAY['triceps'],ARRAY[]::text[],ARRAY['dumbbells','cable'],'Extend weight overhead, elbows close.','https://www.youtube.com/watch?v=-Vyt2QdsR7E'),
('Skull Crushers','strength',ARRAY['triceps'],ARRAY[]::text[],ARRAY['barbell','dumbbells','bench'],'Lower bar to forehead, extend.','https://www.youtube.com/watch?v=d_KZxkY_0cM'),
('Close-Grip Bench Press','strength',ARRAY['triceps','chest'],ARRAY['front delts'],ARRAY['barbell','bench'],'Hands shoulder-width, press.','https://www.youtube.com/watch?v=nEF0bv2FW94'),
('Diamond Push-Up','bodyweight',ARRAY['triceps','chest'],ARRAY[]::text[],ARRAY['bodyweight'],'Hands form diamond under chest.','https://www.youtube.com/watch?v=J0DnG1_S92I'),
('Wrist Curl','strength',ARRAY['forearms'],ARRAY[]::text[],ARRAY['dumbbells','barbell'],'Curl wrists upward.','https://www.youtube.com/watch?v=4Y2ZdHCOXok'),
-- CORE
('Plank','core',ARRAY['core'],ARRAY['shoulders'],ARRAY['bodyweight'],'Forearms down, body straight, hold.','https://www.youtube.com/watch?v=ASdvN_XEl_c'),
('Side Plank','core',ARRAY['obliques'],ARRAY['core'],ARRAY['bodyweight'],'Side hold on forearm, hips lifted.','https://www.youtube.com/watch?v=K2VljzCC16g'),
('Hanging Leg Raise','core',ARRAY['lower abs'],ARRAY['hip flexors'],ARRAY['pull-up bar'],'Hang, raise legs to parallel or higher.','https://www.youtube.com/watch?v=Pr1ieGZ5atk'),
('Cable Crunch','core',ARRAY['abs'],ARRAY[]::text[],ARRAY['cable'],'Kneel, crunch ribs to pelvis.','https://www.youtube.com/watch?v=2fbujeH3F58'),
('Russian Twist','core',ARRAY['obliques'],ARRAY['abs'],ARRAY['bodyweight','dumbbell'],'Lean back, rotate side to side.','https://www.youtube.com/watch?v=wkD8rjkodUI'),
('Ab Wheel Rollout','core',ARRAY['core'],ARRAY['lats','shoulders'],ARRAY['ab wheel'],'Roll out, return without arching.','https://www.youtube.com/watch?v=rqiTPdK1c_I'),
('Mountain Climber','cardio',ARRAY['core'],ARRAY['shoulders','quads'],ARRAY['bodyweight'],'Plank, drive knees to chest alternating.','https://www.youtube.com/watch?v=nmwgirgXLYM'),
('Dead Bug','core',ARRAY['core'],ARRAY[]::text[],ARRAY['bodyweight'],'Lying, extend opposite arm/leg, keep low back flat.','https://www.youtube.com/watch?v=g_BYB0R-4Ws'),
('Bird Dog','core',ARRAY['core','lower back'],ARRAY['glutes'],ARRAY['bodyweight'],'On all fours, extend opposite arm/leg.','https://www.youtube.com/watch?v=wiFNA3sqjCA'),
('Pallof Press','core',ARRAY['obliques','core'],ARRAY[]::text[],ARRAY['cable','band'],'Press handle out, resist rotation.','https://www.youtube.com/watch?v=AH_QZLm_0-s'),
('Sit-Up','core',ARRAY['abs'],ARRAY['hip flexors'],ARRAY['bodyweight'],'Knees bent, sit up to vertical.','https://www.youtube.com/watch?v=jDwoBqPH0jk'),
('Hollow Body Hold','core',ARRAY['core'],ARRAY[]::text[],ARRAY['bodyweight'],'Lying, lift shoulders/legs, low back pressed down.','https://www.youtube.com/watch?v=LlDNef_Ztsc'),
-- CARDIO / HIIT
('Burpee','cardio',ARRAY['full body'],ARRAY[]::text[],ARRAY['bodyweight'],'Squat-thrust to push-up, jump up.','https://www.youtube.com/watch?v=dZgVxmf6jkA'),
('Jump Rope','cardio',ARRAY['calves'],ARRAY['shoulders'],ARRAY['rope'],'Light bounces, wrists drive rope.','https://www.youtube.com/watch?v=1BZM2Vre5oc'),
('Box Jump','plyo',ARRAY['quads','glutes'],ARRAY['calves'],ARRAY['box'],'Explosive jump onto box, soft landing.','https://www.youtube.com/watch?v=52r_Ul5k03g'),
('Kettlebell Swing','power',ARRAY['glutes','hamstrings'],ARRAY['core','back'],ARRAY['kettlebell'],'Hinge, snap hips to swing KB to chest height.','https://www.youtube.com/watch?v=YSxHifyI6s8'),
('Rowing Machine','cardio',ARRAY['back','legs'],ARRAY['core','arms'],ARRAY['rower'],'Drive legs, hinge, pull handle to lower ribs.','https://www.youtube.com/watch?v=H0r_ZPXJLtg'),
('Assault Bike','cardio',ARRAY['legs','arms'],ARRAY['core'],ARRAY['air bike'],'Push and pull simultaneously, full body.','https://www.youtube.com/watch?v=5LoVN4XL4i8'),
('Treadmill Run','cardio',ARRAY['legs'],ARRAY['core'],ARRAY['treadmill'],'Steady or interval running.','https://www.youtube.com/watch?v=brFHyOtTwH4'),
('Sprint','cardio',ARRAY['legs'],ARRAY['core'],ARRAY['track'],'All-out 10-30s effort, full recovery between.','https://www.youtube.com/watch?v=6kALZikXxLc'),
('Jumping Jack','cardio',ARRAY['full body'],ARRAY[]::text[],ARRAY['bodyweight'],'Jump feet wide, arms overhead.','https://www.youtube.com/watch?v=c4DAnQ6DtF8'),
('High Knees','cardio',ARRAY['quads'],ARRAY['core'],ARRAY['bodyweight'],'Drive knees to waist height rapidly.','https://www.youtube.com/watch?v=8opcQdC-V-U'),
-- OLYMPIC / POWER
('Power Clean','power',ARRAY['full body'],ARRAY[]::text[],ARRAY['barbell'],'Pull from floor, catch in front rack.','https://www.youtube.com/watch?v=KwYJTpQ_x5A'),
('Hang Clean','power',ARRAY['full body'],ARRAY[]::text[],ARRAY['barbell'],'Start from hang, explosive pull and catch.','https://www.youtube.com/watch?v=_LpPUFR4Wqk'),
('Push Press','power',ARRAY['shoulders'],ARRAY['legs','triceps'],ARRAY['barbell'],'Dip, drive, press overhead.','https://www.youtube.com/watch?v=iaBVSJm78ko'),
('Snatch','power',ARRAY['full body'],ARRAY[]::text[],ARRAY['barbell'],'One-pull from floor to overhead.','https://www.youtube.com/watch?v=9xQp2sldyts'),
('Thruster','power',ARRAY['full body'],ARRAY[]::text[],ARRAY['barbell','dumbbells'],'Front squat into push press.','https://www.youtube.com/watch?v=L219ltL15zk'),
('Clean and Jerk','power',ARRAY['full body'],ARRAY[]::text[],ARRAY['barbell'],'Clean to shoulders, jerk overhead.','https://www.youtube.com/watch?v=PJyk0ji3O54'),
-- MOBILITY / RECOVERY
('Cat-Cow','mobility',ARRAY['spine'],ARRAY[]::text[],ARRAY['bodyweight'],'On all fours, alternate flexion and extension.','https://www.youtube.com/watch?v=kqnua4rHVVA'),
('World''s Greatest Stretch','mobility',ARRAY['hips','t-spine'],ARRAY[]::text[],ARRAY['bodyweight'],'Lunge, plant elbow, rotate up.','https://www.youtube.com/watch?v=cV4Ese-V6Wo'),
('90/90 Hip Switch','mobility',ARRAY['hips'],ARRAY[]::text[],ARRAY['bodyweight'],'Seated, rotate legs from one 90/90 to the other.','https://www.youtube.com/watch?v=Vqp_VgRGq5E'),
('Couch Stretch','mobility',ARRAY['hip flexors','quads'],ARRAY[]::text[],ARRAY['bodyweight','wall'],'Rear shin against wall, upright torso.','https://www.youtube.com/watch?v=0lCpAj88BxU'),
('Pigeon Pose','mobility',ARRAY['glutes','hips'],ARRAY[]::text[],ARRAY['bodyweight'],'Front shin across, hinge over.','https://www.youtube.com/watch?v=1JaYiKLkbFI'),
('Thoracic Rotation','mobility',ARRAY['t-spine'],ARRAY[]::text[],ARRAY['bodyweight'],'Side lying, rotate top arm open.','https://www.youtube.com/watch?v=1g6qApb8X4g'),
('Banded Shoulder Dislocate','mobility',ARRAY['shoulders'],ARRAY[]::text[],ARRAY['band'],'Pass band overhead and behind, slow.','https://www.youtube.com/watch?v=lmsUYR4jOgI'),
('Foam Roll Quads','recovery',ARRAY['quads'],ARRAY[]::text[],ARRAY['foam roller'],'Roll length of quad, pause on tender spots.','https://www.youtube.com/watch?v=tOiU_a-OO5c'),
('Foam Roll IT Band','recovery',ARRAY['IT band'],ARRAY[]::text[],ARRAY['foam roller'],'Side-lying, roll outer thigh.','https://www.youtube.com/watch?v=g91GO3xS9_8'),
('Foam Roll Upper Back','recovery',ARRAY['t-spine'],ARRAY[]::text[],ARRAY['foam roller'],'Cross arms, roll upper back, extend over.','https://www.youtube.com/watch?v=NjrTGcap8Wk'),
('Child''s Pose','mobility',ARRAY['back','hips'],ARRAY[]::text[],ARRAY['bodyweight'],'Hips to heels, arms extended.','https://www.youtube.com/watch?v=2MJGg-dUKh0'),
('Downward Dog','mobility',ARRAY['hamstrings','calves'],ARRAY['shoulders'],ARRAY['bodyweight'],'Inverted V, push hips back.','https://www.youtube.com/watch?v=YqOqM79McYY'),
-- FUNCTIONAL / UNILATERAL
('Single-Leg RDL','strength',ARRAY['hamstrings','glutes'],ARRAY['core'],ARRAY['dumbbells'],'Hinge on one leg, opposite leg back.','https://www.youtube.com/watch?v=FvxKv8Pb3HI'),
('Single-Arm DB Row','strength',ARRAY['lats'],ARRAY['biceps','core'],ARRAY['dumbbell','bench'],'One knee on bench, row to hip.','https://www.youtube.com/watch?v=pYcpY20QaE8'),
('Single-Arm Press','strength',ARRAY['shoulders'],ARRAY['core','triceps'],ARRAY['dumbbell','kettlebell'],'Press one weight, brace core.','https://www.youtube.com/watch?v=5yWaNOvgFCM'),
('Farmer''s Carry','strength',ARRAY['traps','forearms'],ARRAY['core','legs'],ARRAY['dumbbells','kettlebells'],'Heavy walk, posture tall.','https://www.youtube.com/watch?v=Fkzk_RqlYig'),
('Suitcase Carry','strength',ARRAY['obliques','forearms'],ARRAY['core'],ARRAY['dumbbell','kettlebell'],'One-side load, walk without leaning.','https://www.youtube.com/watch?v=qmHkS4iy01Q'),
('Turkish Get-Up','power',ARRAY['full body'],ARRAY[]::text[],ARRAY['kettlebell'],'Lying to standing while pressing weight.','https://www.youtube.com/watch?v=jFK8FOiLa_M'),
('Pistol Squat','bodyweight',ARRAY['quads','glutes'],ARRAY['core'],ARRAY['bodyweight'],'Single-leg full squat.','https://www.youtube.com/watch?v=qDcniqddTeE'),
('Nordic Curl','bodyweight',ARRAY['hamstrings'],ARRAY[]::text[],ARRAY['bodyweight','partner'],'Anchor feet, lower torso forward eccentric.','https://www.youtube.com/watch?v=q3w0OLaCduo'),
('Reverse Lunge','bodyweight',ARRAY['quads','glutes'],ARRAY['hamstrings'],ARRAY['dumbbells','bodyweight'],'Step backward, lower knee.','https://www.youtube.com/watch?v=l3oQYIM7zVI'),
('Cossack Squat','mobility',ARRAY['adductors','quads'],ARRAY['glutes'],ARRAY['bodyweight','dumbbell'],'Lateral squat, opposite leg straight.','https://www.youtube.com/watch?v=bjFkkzS4-9w'),
-- BANDS
('Banded Row','strength',ARRAY['back'],ARRAY['biceps'],ARRAY['band'],'Anchor band, row to ribs.','https://www.youtube.com/watch?v=xQNrFHEMhI4'),
('Banded Press','strength',ARRAY['chest'],ARRAY['triceps'],ARRAY['band'],'Anchor behind, press forward.','https://www.youtube.com/watch?v=R0mMc5G5Rpk'),
('Banded Lateral Walk','mobility',ARRAY['glutes'],ARRAY[]::text[],ARRAY['band'],'Band above knees, side-step.','https://www.youtube.com/watch?v=Yp7XMQK4-QE'),
('Banded Pull-Apart','strength',ARRAY['rear delts'],ARRAY['mid back'],ARRAY['band'],'Pull band apart at chest height.','https://www.youtube.com/watch?v=AwBhvLg7dHk'),
('Banded Good Morning','strength',ARRAY['hamstrings','glutes'],ARRAY['back'],ARRAY['band'],'Band on traps, hinge.','https://www.youtube.com/watch?v=vKPGe8zb2S8');
