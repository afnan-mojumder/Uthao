// Generator script for T5.7 Richer Dialogue
// Generates data/dialogue_lines.json, data/dialogue/en/dialogue.json, data/dialogue/bn/dialogue.json

import fs from 'node:fs';
import path from 'node:path';

const archetypes = ['bargainer', 'commuter', 'careful', 'regular', 'risky'];
const phases = ['greeting', 'offer', 'counter', 'accept', 'reject', 'small_talk', 'drop_off'];

// Base themes per archetype & phase to ensure rich variety and cultural realism
const templates = {
  bargainer: {
    greeting: [
      { en: "Brother, going towards {destination}? Let's negotiate a fair price.", bn: "ভাই, {destination}-এর দিকে যাবেন? আসেন একটা ন্যায্য ভাড়া ঠিক করি।" },
      { en: "Assalamu Alaikum brother! Spare bike available for {destination}?", bn: "আসসালামু আলাইকুম ভাই! {destination} যাওয়ার জন্য বাইক ফাঁকা আছে?" },
      { en: "Hey rider brother, will you head my way? Road seems quite clear.", bn: "এই যে ভাই রাইডার, আমার রুটে যাবেন? রাস্তা তো মোটামুটি ফাঁকা।" },
      { en: "Brother, take me along. Regular everyday commuter here.", bn: "ভাই, আমাকে নিয়ে চলেন। আমি তো এই রুটের নিয়মিত যাত্রী।" },
      { en: "Listen brother, got room for one going to {destination}?", bn: "শোনেন ভাই, {destination} যাবেন? একজন যাত্রী নেওয়া যাবে?" },
      { en: "Brother rider, looking for a ride before the evening crowd builds up.", bn: "রাইডার ভাই, সন্ধ্যার জ্যাম লাগার আগেই একটা রাইড খুঁজছি।" },
      { en: "Peace brother, let's talk fare. I travel light and fast.", bn: "সালাম ভাই, আসেন ভাড়াটা কথা বলি। হালকা ব্যাগে চটজলদি যাব।" },
      { en: "O brother, heading towards the market side?", bn: "ও ভাই, বাজারের মোড়ের দিকে যাচ্ছেন নাকি?" },
      { en: "Brother, give me a good rate and I'll jump right on.", bn: "ভাই, একটু ভালো রেট দিলে এখনই উঠে পড়ি।" },
      { en: "Hey boss, free for a quick drop to {destination}?", bn: "এই যে বস, {destination} পর্যন্ত চট করে একটু নামিয়ে দেওয়া যাবে?" },
      { en: "Brother, let's settle a student-friendly fare today.", bn: "ভাই, আজকের দিনে একটু ছাত্রবান্ধব ভাড়া ঠিক করেন।" },
      { en: "Good day brother! Need a reliable bike for a short stretch.", bn: "শুভ দিন ভাই! অল্প দূরত্বের জন্য একটা ভরসা করার মতো বাইক দরকার।" },
      { en: "Brother, got 5 minutes to negotiate and roll?", bn: "ভাই, পাঁচ মিনিটের মধ্যে কথা সেরে রওনা দেওয়া যাবে?" },
      { en: "Hey brother, heading south? Give me a shout.", bn: "এই যে ভাই, দক্ষিণের দিকে যাবেন? আওয়াজ দিয়েন।" },
      { en: "Brother, let's make a deal both of us are happy with.", bn: "ভাই, আসেন এমন একটা চুক্তি করি যাতে দুজনেরই লাভ হয়।" }
    ],
    offer: [
      { en: "App says ৳{fare}, but how about we do it for ৳{offer}?", bn: "অ্যাপে দেখাচ্ছে ৳{fare}, কিন্তু ৳{offer} টাকায় হলে কেমন হয়?" },
      { en: "I can give ৳{offer} cash right now, no fuss.", bn: "এখনই নগদ ৳{offer} দিচ্ছি ভাই, কোনো ঝামেলা নাই।" },
      { en: "How about ৳{offer}? I know the road is a straight shot.", bn: "৳{offer} টাকা হলে চলেন? রাস্তা তো একবারে সোজা।" },
      { en: "Brother, ৳{offer} is my everyday rate for this route.", bn: "ভাই, এই রুটে আমি সবসময় ৳{offer} দিয়েই যাতায়াত করি।" },
      { en: "Let's do ৳{offer}. Keep it light on a working man's pocket.", bn: "৳{offer} করে দেন ভাই। খেটে খাওয়া মানুষের পকেটের দিকেও একটু তাকান।" },
      { en: "Can we start at ৳{offer}? It's just past the flyover ramp.", bn: "৳{offer} দিয়ে শুরু করা যায়? ফ্লাইওভারের গোড়া পার হলেই তো।" },
      { en: "I have exactly ৳{offer} in change ready in hand.", bn: "আমার হাতে ঠিক ৳{offer} টাকার খুচরা প্রস্তুত আছে।" },
      { en: "Give me ৳{offer} today, I'll call you again tomorrow.", bn: "আজকে ৳{offer} টাকায় নিয়ে চলেন, কালকেও আপনাকে ডাকব।" },
      { en: "Look, CNG asked too much, how about ৳{offer} on bike?", bn: "দেখেন, সিএনজিওয়ালারা আকাশচুম্বী চায়, বাইকে ৳{offer} কেমন?" },
      { en: "How about ৳{offer}? It's non-peak hours anyway.", bn: "৳{offer} টাকা দিলে কেমন হয়? এখন তো তেমন অফিস জ্যামও নাই।" },
      { en: "I can afford ৳{offer} today, brother. Consider it.", bn: "আজকে আমার বাজেট ৳{offer} টাকা ভাই, একটু বিবেচনা করেন।" },
      { en: "Let's agree on ৳{offer} and avoid the app cut.", bn: "আসেন ৳{offer} ঠিক করি, অ্যাপের কমিশনও তো বেঁচে যাবে।" },
      { en: "Brother, ৳{offer} is fair market value for this distance.", bn: "ভাই, এই দূরত্বের জন্য ৳{offer} টাকা একেবারেই খাঁটি দর।" },
      { en: "Would ৳{offer} be fine? I'll walk across to meet you.", bn: "৳{offer} হলে হবে? আমি হেঁটে ওপারে এসে উঠব।" },
      { en: "Make it ৳{offer} and we start our journey immediately.", bn: "৳{offer} রাখেন, এখনই আমরা রওনা দিতে পারি।" }
    ],
    counter: [
      { en: "৳{fare}? Come on brother, meet me midway at ৳{counter}!", bn: "৳{fare}? কি যে বলেন ভাই, মাঝামাঝি ৳{counter} টাকায় আসেন!" },
      { en: "Brother, that's steep. How about ৳{counter} and done?", bn: "ভাই, এটা বেশি হয়ে যায়। ৳{counter} টাকায় রফা করেন?" },
      { en: "Add ৳10 from my side, make it ৳{counter}. Final call!", bn: "আমার দিক থেকে ১০ টাকা বাড়ালাম, ৳{counter} ধরেন। শেষ কথা!" },
      { en: "Brother, ৳{counter} is the most I can stretch today.", bn: "ভাই, আজকের দিনে ৳{counter} এর বেশি আর টানা সম্ভব না।" },
      { en: "Split the difference, brother! ৳{counter} sounds honest.", bn: "পার্থক্যটা আধাআধি ভাগ করে নেন ভাই! ৳{counter} ন্যায্য হয়।" },
      { en: "Even with fuel prices, ৳{counter} leaves you good profit.", bn: "তেলের দাম বাড়লেও ৳{counter} টাকায় আপনার ভালোই লাভ থাকবে।" },
      { en: "Brother, respect my budget too. ৳{counter} is fair.", bn: "ভাই, আমার সাধ্যটাও একটু দেখেন। ৳{counter} একদম ঠিকঠাক।" },
      { en: "Let's meet at ৳{counter}. Neither loss for you nor me.", bn: "আসেন ৳{counter}-এ মিল করি। আপনারও লস নাই, আমারও না।" },
      { en: "Take ৳{counter}, brother. I won't haggle further.", bn: "৳{counter} টাকা নেন ভাই, আর এক পয়সাও দরদাম করব না।" },
      { en: "How about ৳{counter}? It's a quick 10-minute drop.", bn: "৳{counter} হলে কেমন হয়? ১০ মিনিটের তো মামলা।" },
      { en: "I have ৳{counter} right here in notes. Let's shake hands.", bn: "আমার কাছে ঠিক ৳{counter} টাকার নোট আছে। আসেন হাত মেলাই।" },
      { en: "Brother, don't break a regular customer's heart. ৳{counter}?", bn: "ভাই, নিয়মিত যাত্রীর মন ভাঙবেন না। ৳{counter} করবেন?" },
      { en: "Okay, ৳{counter} and you don't even have to enter the narrow lane.", bn: "ঠিক আছে, ৳{counter} দিচ্ছি, আপনাকে গলির ভেতরেও ঢুকতে হবে না।" },
      { en: "Let's settle on ৳{counter}, brother. Time is ticking.", bn: "৳{counter}-এ ফাইনাল করেন ভাই, সময় চলে যাচ্ছে।" },
      { en: "Final offer from me: ৳{counter}. Take it with a smile!", bn: "আমার শেষ প্রস্তাব: ৳{counter} টাকা। হাসিমুখে রাজি হয়ে যান!" }
    ],
    accept: [
      { en: "Done deal brother! Hand me the helmet, let's go.", bn: "ডান ভাই! হেলমেটটা দেন, চলেন রওনা হই।" },
      { en: "Agreed! You drive with good sense, I like that.", bn: "রাজি! আপনার কথাবার্তা ভালো লাগল, চলেন যাই।" },
      { en: "Deal fixed! Let's get moving before traffic piles up.", bn: "রফা হয়ে গেল! জ্যাম বাড়ার আগেই কেটে পড়ি চলেন।" },
      { en: "Fair enough brother. Let's start the ride.", bn: "ন্যায্য কথা ভাই। চলেন বাইক স্টার্ট দেন।" },
      { en: "That works for both of us. Let's hit the road.", bn: "দুজনের জন্যই ভালো হলো। চলেন রাস্তায় নামা যাক।" },
      { en: "Okay brother, hopping on now. Take the flyover side.", bn: "ঠিক আছে ভাই, এই উঠলাম। ফ্লাইওভারের সাইড দিয়ে নিয়েন।" },
      { en: "Settled! You have yourself a passenger today.", bn: "চুক্তি পাক্কা! আজকের মতো একজন যাত্রী পেয়ে গেলেন।" },
      { en: "Agreed. Smooth negotiation, brother!", bn: "সম্মত হলাম। সুন্দরভাবে দরদাম মেটালেন ভাই!" },
      { en: "Fine with me. Let's ride safely and steadily.", bn: "আমার আপত্তি নাই। নিরাপদে আর সাবধানে চলেন।" },
      { en: "Deal accepted! Hope we dodge the signal jam.", bn: "ডিল কবুল! আশা করি সিগন্যালের জ্যামটা এড়ানো যাবে।" },
      { en: "Alright rider brother, step on the gas!", bn: "বেশ তো ভাই রাইডার, অ্যাক্সিলারেটর ঘোরান!" },
      { en: "Okay brother, ৳{fare} it is. Let's go.", bn: "ঠিক আছে ভাই, ৳{fare} টাকাই চূড়ান্ত। চলেন।" },
      { en: "Pleasure making a deal with you. Onward!", bn: "আপনার সাথে কথা বলে ভালো লাগল। সামনে বাড়েন!" },
      { en: "Accepted! Let's reach before the prayer call.", bn: "রাজি! আযানের আগেই পৌঁছে যেতে পারলে ভালো হয়।" },
      { en: "Let's roll! Your price is very reasonable.", bn: "চলেন যাই! আপনার দামটা বেশ যুক্তিযুক্ত।" }
    ],
    reject: [
      { en: "No brother, that's way over my budget. I'll take a bus.", bn: "না ভাই, এটা আমার সাধ্যের বাইরে। আমি বাসেই চলে যাই।" },
      { en: "Too high today, brother. I will look for another bike.", bn: "আজকে বেশি চেয়ে ফেললেন ভাই। আমি অন্য বাইক দেখি।" },
      { en: "Can't stretch that far, brother. Never mind.", bn: "এতদূর টানা সম্ভব না ভাই। কিছু মনে করবেন না।" },
      { en: "That's rich pricing for a short distance! Next time perhaps.", bn: "অল্প দূরত্বের জন্য এত ভাড়া! পরের বার দেখা যাবে।" },
      { en: "No brother, my wallet doesn't allow that today.", bn: "না ভাই, আজকে আমার মানিব্যাগ এতে সায় দিচ্ছে না।" },
      { en: "Better for me to walk a stretch and hail another ride.", bn: "আমার বরং কিছুটা হেঁটে গিয়ে অন্য বাহন ধরাই ভালো।" },
      { en: "Sorry brother, that fare is too steep for me.", bn: "দুঃখিত ভাই, এই ভাড়া আমার জন্য বড্ড বেশি।" },
      { en: "We couldn't match terms today, brother. Safe travels!", bn: "আজকে আর বনিবনা হলো না ভাই। আপনার যাত্রা শুভ হোক!" },
      { en: "No deal brother, I'll wait for a local shared auto.", bn: "হলো না ভাই, আমি বরং লোকাল শেয়ার অটো ধরি।" },
      { en: "Can't do it, brother. Let's see next time.", bn: "হবে না ভাই। দেখা হবে পরের বার।" },
      { en: "That's CNG pricing, brother! I'll pass.", bn: "এটা তো সিএনজির ভাড়া চাইলেন ভাই! আমি বরং ছাড়লাম।" },
      { en: "Budget is tight at month-end, brother. Have to decline.", bn: "মাসের শেষ ভাই, হাত টান। না বলতেই হচ্ছে।" },
      { en: "No brother, thank you anyway for your time.", bn: "না ভাই, তবুও সময় দেওয়ার জন্য অনেক ধন্যবাদ।" },
      { en: "I'll try another app or walk. Good day!", bn: "আমি অন্য কোনো অ্যাপে দেখি অথবা হেঁটেই যাই। ভালো থাকবেন!" },
      { en: "Too expensive for me today brother. Assalamu Alaikum.", bn: "আজকে আমার জন্য বড্ড বেশি ভাই। আসসালামু আলাইকুম।" }
    ],
    small_talk: [
      { en: "Did you catch yesterday's cricket match? What a finish!", bn: "কালকের ক্রিকেট ম্যাচটা দেখেছিলেন? কী অবিশ্বাস্য ফিনিশ!" },
      { en: "Karwan Bazar wholesale vegetable prices jumped again this morning.", bn: "কাওরান বাজারে পাইকারি শাকসবজির দাম আজকে সকালে আবার বাড়ল।" },
      { en: "Dhaka traffic has no rhyme or reason, but two-wheelers survive.", bn: "ঢাকার জ্যামের কোনো আগামাথা নাই, তবে দুই চাকার ভরসায় চলা যায়।" },
      { en: "If Tigers win the next series, the entire city will celebrate.", bn: "টাইগাররা পরের সিরিজটা জিতলে পুরো শহরে উৎসব লেগে যাবে।" },
      { en: "Brother, buying fish in Dhaka requires an Olympic bargaining medal!", bn: "ভাই, ঢাকায় মাছ কিনতে গেলে তো দরদামের অলিম্পিক মেডেল লাগে!" },
      { en: "Look at the sky, clouds gathering. Hope we don't get drenched.", bn: "আকাশের অবস্থা দেখেন, মেঘ জমছে। ভিজে একসা না হলেই বাঁচি।" },
      { en: "My cousin is taking the BCS preliminary next month. High tension!", bn: "আমার কাজিন আগামী মাসে বিসিএস প্রিলিমিনারি দেবে। প্রচণ্ড টেনশন!" },
      { en: "A cup of strong ginger tea at the corner stall cures all tiredness.", bn: "মোড়ের টঙের এক কাপ কড়া আদা চা সব ক্লান্তি দূর করে দেয়।" },
      { en: "Electricity bills and commodity prices are testing everyone these days.", bn: "বিদ্যুৎ বিল আর নিত্যপণ্যের দাম আজকাল সবাইকে পরীক্ষায় ফেলছে।" },
      { en: "Yesterday a goat was chilling on the divider like a traffic inspector!", bn: "কালকে ডিভাইডারের ওপর একটা ছাগল এমনভাবে বসা ছিল যেন ট্রাফিক সার্জেন্ট!" },
      { en: "Driving in Dhaka teaches you more patience than meditating on a mountain.", bn: "ঢাকায় গাড়ি চালানো পাহাড়ে ধ্যান করার চেয়েও বেশি ধৈর্য শেখায়।" },
      { en: "Do you listen to the radio commentary while riding, brother?", bn: "বাইক চালানোর সময় কি রেডিও ধারাভাষ্য শোনেন ভাই?" },
      { en: "Every family has someone prepping for exams or jobs right now.", bn: "প্রত্যেক ঘরেই এখন কেউ না কেউ চাকরির পরীক্ষা বা পড়ার চিন্তায় আছে।" },
      { en: "If that flyover link opens, maybe our daily travel time cuts in half.", bn: "ফ্লাইওভারের লিঙ্ক রোডটা খুললে হয়তো আমাদের সময় অর্ধেক বেঁচে যেত।" },
      { en: "Dhaka city is restless, but people here never lose their heart.", bn: "ঢাকা শহর যতই ব্যস্ত হোক, এখানকার মানুষের মন কখনো ছোট হয় না।" }
    ],
    drop_off: [
      { en: "Here is your exact ৳{fare}, brother. Count it up.", bn: "এই নেন আপনার ঠিক ৳{fare} টাকা ভাই। গুনে নেন।" },
      { en: "Thanks for dropping me right at the corner. Safe riding!", bn: "একদম মোড়ে নামিয়ে দেওয়ার জন্য ধন্যবাদ। সাবধানে বাইক চালান!" },
      { en: "Keep the extra ৳10 for a warm cup of tea, brother.", bn: "বাড়তি ১০ টাকা এক কাপ গরম চায়ের জন্য রেখে দেন ভাই।" },
      { en: "Pleased with the ride, brother. May your earnings be blessed.", bn: "রাইডটা খুব পছন্দ হয়েছে ভাই। আপনার রুজি-রোজগারে বরকত হোক।" },
      { en: "Right here is perfect. Thank you for the smooth ride!", bn: "এখানে নামালেই হবে। চমৎকারভাবে পৌঁছে দেওয়ার জন্য ধন্যবাদ!" },
      { en: "Here's the payment. May you find plenty of rides today.", bn: "ভাড়াটা নেন ভাই। আজকে যেন প্রচুর খ্যাপ পান।" },
      { en: "Arrived in one piece and on time. Much appreciated!", bn: "সহি-সালামতে আর ঠিক সময়ে পৌঁছালাম। অনেক কৃতজ্ঞতা!" },
      { en: "Take care brother, don't ride too tired in the heat.", bn: "নিজের যত্ন নিয়েন ভাই, রোদের মধ্যে বেশি ক্লান্ত হয়ে চালাবেন না।" },
      { en: "Payment made. Have a wonderful and profitable day!", bn: "পেমেন্ট দিলাম ভাই। দিনটা দারুণ আর লাভজনক কাটুক!" },
      { en: "Saved me from walking the flyover ramp. Thank you brother!", bn: "ফ্লাইওভারের র‍্যাম্পে হাঁটার হাত থেকে বাঁচালেন। ধন্যবাদ ভাই!" },
      { en: "Here is ৳{fare}. You drive with great skill in heavy traffic.", bn: "এই নেন ৳{fare} টাকা। জ্যামের মধ্যেও আপনি বেশ দক্ষতার সাথে চালিয়েছেন।" },
      { en: "May God keep you safe on these wild roads, brother.", bn: "আল্লাহ এই উত্তাল রাস্তায় আপনাকে সহি-সালামতে রাখুন ভাই।" },
      { en: "Exact change ready as promised. Take care!", bn: "কথা অনুযায়ী খুচরা টাকাই দিলাম। ভালো থাকবেন!" },
      { en: "Got here before my appointment started. Big relief!", bn: "আমার অ্যাপয়েন্টমেন্টের আগেই চলে আসলাম। বড় বাঁচা বাঁচালেন!" },
      { en: "Fare paid in full. See you on the roads again, brother!", bn: "ভাড়া পরিশোধ ভাই। রাস্তায় আবার দেখা হবে নিশ্চয়ই!" }
    ]
  },

  commuter: {
    greeting: [
      { en: "Office time rush! Need to reach {destination} quickly, brother.", bn: "অফিসের তাড়া ভাই! {destination} দ্রুত পৌঁছাতে হবে।" },
      { en: "Morning brother! Are you heading towards the commercial area?", bn: "শুভ সকাল ভাই! আপনি কি বাণিজ্যিক এলাকার দিকে যাচ্ছেন?" },
      { en: "Got a presentation in 25 minutes. Can you take me?", bn: "২৫ মিনিটের মধ্যে আমার প্রেজেন্টেশন। নিয়ে যেতে পারবেন ভাই?" },
      { en: "Hey rider, quick trip to Motinagar? I'm already a bit delayed.", bn: "এই যে ভাই রাইডার, মতিনগরে চটজলদি যাওয়া যাবে? একটু দেরি হয়ে গেছে।" },
      { en: "Brother, corporate shift starts at 9 sharp. Available?", bn: "ভাই, ৯টায় আমার অফিস শুরু। যাওয়া যাবে কি?" },
      { en: "Need a fast, professional ride to {destination}, please.", bn: "{destination}-এ দ্রুত আর পেশাদার একটা রাইড দরকার ভাই।" },
      { en: "Good day brother. Traveling with a light laptop bag.", bn: "শুভ দিন ভাই। সঙ্গে শুধু একটা হালকা ল্যাপটপ ব্যাগ আছে।" },
      { en: "Can we dodge the main junction gridlock on a bike?", bn: "বাইকে করে কি প্রধান মোড়ের জ্যামটা কাটিয়ে বের হওয়া যাবে?" },
      { en: "Heading to the bank headquarters. Are you free?", bn: "ব্যাংকের প্রধান কার্যালয়ের দিকে যাব। ফাঁকা আছেন ভাই?" },
      { en: "Hello brother! Fast drop to the IT park if possible.", bn: "হ্যালো ভাই! সম্ভব হলে আইটি পার্ক পর্যন্ত চটপট পৌঁছে দেন।" },
      { en: "Looking for an experienced rider who knows alternate cuts.", bn: "অভিজ্ঞ রাইডার খুঁজছি যিনি ভেতরের শর্টকাটগুলো চেনেন।" },
      { en: "Time is money this morning, brother. Will you go?", bn: "আজকে সকালে সময়ের অনেক দাম ভাই। যাবেন কি?" },
      { en: "Brother, let's take the expressway bypass if it's open.", bn: "ভাই, এক্সপ্রেসওয়ের বাইপাস খোলা থাকলে ওদিক দিয়ে যাওয়া যাবে?" },
      { en: "Need to beat the biometric attendance deadline today!", bn: "আজকে বায়োমেট্রিক হাজিরার ডেডলাইন পার করার আগেই ঢুকতে হবে!" },
      { en: "Assalamu Alaikum brother. Quick ride to Gulbari district?", bn: "আসসালামু আলাইকুম ভাই। গুলবাড়ি পর্যন্ত একটা দ্রুত রাইড হবে?" }
    ],
    offer: [
      { en: "App fare is ৳{fare}. I'll pay upfront if you take off right away.", bn: "অ্যাপের ভাড়া ৳{fare} টাকা। এখনই রওনা দিলে পুরোটা নগদ দিচ্ছি।" },
      { en: "I can do ৳{offer} if we take the fastest route without stops.", bn: "কোনো থামাথামি ছাড়া দ্রুততম রুটে গেলে ৳{offer} দেব ভাই।" },
      { en: "Company reimburses standard fare ৳{offer}. Does that work?", bn: "অফিস থেকে ৳{offer} টাকা দেবে। এতে আপনার চলবে ভাই?" },
      { en: "I offer ৳{offer}. Let's not waste time haggling.", bn: "আমি ৳{offer} টাকা দিতে রাজি। দরদামে সময় নষ্ট না করি।" },
      { en: "Standard corporate rate ৳{offer}. Ready to roll?", bn: "আমাদের নিয়মিত কর্পোরেট রেট ৳{offer}। রওনা দেবেন?" },
      { en: "How about ৳{offer}? Just make sure we skip the signal jam.", bn: "৳{offer} হলে কেমন হয়? শুধু সিগন্যালের জ্যামটা এড়িয়ে নিয়েন।" },
      { en: "I'll do ৳{offer} flat. Time matters more than ৳20 today.", bn: "একদমে ৳{offer} দিচ্ছি। আজকের দিনে ২০ টাকার চেয়ে সময়ের দাম বেশি।" },
      { en: "Fair rate ৳{offer} for a fast drop to the business hub.", bn: "বিজনেস সেন্টারে দ্রুত পৌঁছে দেওয়ার জন্য ৳{offer} একদম ন্যায্য।" },
      { en: "Offering ৳{offer} right now. Can we start immediately?", bn: "এখনই ৳{offer} প্রস্তাব করছি। সাথে সাথে স্টার্ট দেওয়া যাবে?" },
      { en: "Will pay ৳{offer} if you have an extra clean helmet.", bn: "একটা পরিষ্কার হেলমেট থাকলে আমি ৳{offer} দিচ্ছি ভাই।" },
      { en: "Here's ৳{offer} on the table. Let's make every minute count.", bn: "৳{offer} টাকা দিচ্ছি। প্রতিটা মিনিটের সঠিক ব্যবহার করি চলেন।" },
      { en: "I'm offering ৳{offer}. It's well above the fuel cost.", bn: "আমি ৳{offer} দিচ্ছি। তেলের খরচের চেয়ে অনেক বেশি বাঁচবে।" },
      { en: "৳{offer} works for me. Let's get ahead of the morning peak.", bn: "৳{offer} আমার জন্য ঠিক আছে। সকালের পিক আওয়ারের আগেই পার হই।" },
      { en: "Take ৳{offer} and let's ride via the bypass.", bn: "৳{offer} নেন আর বাইপাস দিয়ে চট করে নিয়ে চলেন।" },
      { en: "I propose ৳{offer}. Quick, clean and professional.", bn: "আমার অফার ৳{offer}। একদম পরিষ্কার আর পেশাদার হিসাব।" }
    ],
    counter: [
      { en: "৳{fare}? If you guarantee reaching before 10 AM, I'll pay ৳{counter}.", bn: "৳{fare}? ১০টার আগে পৌঁছানোর নিশ্চয়তা দিলে আমি ৳{counter} দেব।" },
      { en: "Let's meet at ৳{counter}. That covers your fuel and time.", bn: "৳{counter} টাকায় রাজি হন। আপনার তেল আর সময় দুটোই পোষাবে।" },
      { en: "I can stretch to ৳{counter}, but please ride briskly.", bn: "আমি টেনে ৳{counter} করতে পারি, তবে একটু চটপটে টানতে হবে।" },
      { en: "Make it ৳{counter} and let's go. My meeting won't wait.", bn: "৳{counter} রাখেন আর চলেন। মিটিং তো আর বসে থাকবে না।" },
      { en: "Brother, ৳{counter} is reasonable. Don't delay us further.", bn: "ভাই, ৳{counter} যথেষ্ট ন্যায্য। আর দেরি না করি।" },
      { en: "I'll agree to ৳{counter} if we avoid the crowded bus lane.", bn: "বাস লেন এড়িয়ে চললে আমি ৳{counter} দিতে রাজি আছি।" },
      { en: "Let's settle on ৳{counter}. Every minute standing is costly.", bn: "৳{counter}-এ রাজি হয়ে যান। এখানে দাঁড়িয়ে থাকা মানেই সময়ের অপচয়।" },
      { en: "৳{counter} is my final budget approved for morning commute.", bn: "সকালের যাতায়াতের জন্য ৳{counter} টাকার বেশি দেওয়ার উপায় নাই।" },
      { en: "Take ৳{counter} and we'll leave right this second.", bn: "৳{counter} নেন আর এই সেকেন্ডেই স্টার্ট দিন।" },
      { en: "I will do ৳{counter}. Please hand over the passenger helmet.", bn: "আমি ৳{counter} দেব। অনুগ্রহ করে পেছনের হেলমেটটা দিন।" },
      { en: "Fine, ৳{counter}. Let's make sure we don't get stuck behind trucks.", bn: "ঠিক আছে, ৳{counter}। শুধু ট্রাকের পেছনে আটকে না পড়লেই হলো।" },
      { en: "I can accept ৳{counter}. Deal?", bn: "আমি ৳{counter} মানতে পারি। পাকা?" },
      { en: "Split it to ৳{counter}. We both get what we need.", bn: "৳{counter} টাকায় রফা করেন। আমাদের দুজনেরই কাজ হাসিল হবে।" },
      { en: "৳{counter} works. Let's move fast and safe.", bn: "৳{counter} চলবে। চলেন দ্রুত আর সাবধানে যাওয়া যাক।" },
      { en: "Let's lock in ৳{counter}. Time to twist the throttle.", bn: "৳{counter} চূড়ান্ত করেন। এবার বাইকের গতি তুলুন।" }
    ],
    accept: [
      { en: "Agreed! Hand me the helmet, let's beat the clock.", bn: "রাজি! হেলমেটটা দিন, ঘড়ির কাটার সাথে দৌড়াতে হবে।" },
      { en: "Deal accepted. Please take the elevated road.", bn: "চুক্তি চূড়ান্ত। অনুগ্রহ করে ফ্লাইওভারের ওপর দিয়ে নিয়েন।" },
      { en: "Perfect! Professional and swift. Let's move.", bn: "চমৎকার! একদম পেশাদার হিসাব। চলেন সামনে বাড়েন।" },
      { en: "Done. I appreciate you not haggling forever.", bn: "পাক্কা। অনন্তকাল দরদাম না করায় ধন্যবাদ।" },
      { en: "Accepted. Let's maintain a steady speed throughout.", bn: "রাজি হলাম। পুরোটা পথ একই রকম গতি বজায় রাখিয়েন।" },
      { en: "Great, jumping on. Office tower gate, please.", bn: "দারুণ, উঠে পড়লাম। অফিস টাওয়ারের গেটে নামাবেন প্লিজ।" },
      { en: "Deal sealed. Let's weave safely through this traffic.", bn: "ডিল পাক্কা। ট্রাফিকের ফাঁকফোকর দিয়ে সাবধানে নিয়ে চলেন।" },
      { en: "Fine with me. Let's ensure a punctual drop.", bn: "আমার সমস্যা নাই। ঠিক সময়ে পৌঁছানোটা নিশ্চিত করবেন।" },
      { en: "Agreed. Let's go before the signal turns red.", bn: "সম্মত হলাম। সিগন্যাল লাল হওয়ার আগেই বের হয়ে যাই।" },
      { en: "That fare works. Thank you for accommodating.", bn: "ভাড়াটা ঠিক আছে। রাজি হওয়ার জন্য ধন্যবাদ ভাই।" },
      { en: "Accepted! Straight towards the business district.", bn: "মেনে নিলাম! একদম সোজা বাণিজ্যিক এলাকার দিকে টানেন।" },
      { en: "Good agreement. Let's ride safely.", bn: "ভালো বনিবনা হলো। সাবধানে চালান।" },
      { en: "Done deal. Watch out for sudden lane changes.", bn: "কথা পাকা। হুটহাট লেন বদলানো গাড়িগুলো খেয়াল রাখিয়েন।" },
      { en: "Alright, let's roll without delay.", bn: "ঠিক আছে, আর কোনো দেরি না করে রওনা দেই।" },
      { en: "Agreed! Time to reach my office desk.", bn: "রাজি! এবার ঠিক সময়ে অফিস ডেস্কে পৌঁছানোর পালা।" }
    ],
    reject: [
      { en: "Too high, and we spent too long arguing. Hailing another ride.", bn: "ভাড়াও বেশি চাইলেন, সময়ও নষ্ট হলো। আমি অন্য রাইড দেখি।" },
      { en: "Cannot approve that fare on company expense. Sorry.", bn: "অফিস খরচে এই পরিমাণ ভাড়া অনুমোদন হবে না। দুঃখিত।" },
      { en: "No brother, that's unreasonable for a standard commute.", bn: "না ভাই, সাধারণ যাতায়াতের জন্য এটা বড্ড বেশি।" },
      { en: "Time is running out, I cannot negotiate further. Declining.", bn: "সময় শেষ হয়ে আসছে, আর দরদাম করতে পারছি না। বাতিল করলাম।" },
      { en: "Sorry, I will take the metro or find another rider.", bn: "দুঃখিত ভাই, আমি বরং মেট্রো রেল ধরি বা অন্য কাউকে দেখি।" },
      { en: "That fare is higher than an AC cab! Pass.", bn: "এ তো এসি ট্যাক্সির চেয়েও বেশি চেয়ে বসলেন! ছাড়লাম।" },
      { en: "Doesn't fit my corporate daily commute allowance.", bn: "আমার দৈনিক যাতায়াত ভাতার সাথে এটা মিলছে না।" },
      { en: "Declining. Hope you find another passenger soon.", bn: "না করলাম। আশা করি শীঘ্রই অন্য যাত্রী পেয়ে যাবেন।" },
      { en: "Can't justify this cost to my manager. Good day.", bn: "এই খরচ আমার ম্যানেজারের কাছে জবাবদিহি করতে পারব না। শুভ দিন।" },
      { en: "We're too far apart on pricing. I'm moving on.", bn: "ভাড়ার পার্থক্যে কোনো মিল হলো না। আমি এগোচ্ছি।" },
      { en: "No thanks, I will look for a shared shuttle.", bn: "ধন্যবাদ ভাই, আমি শেয়ার শাটল দেখব।" },
      { en: "Too expensive for the distance. Declining.", bn: "দূরত্বের তুলনায় বড্ড বেশি। না বললাম।" },
      { en: "Sorry brother, that exceeds my daily travel ceiling.", bn: "দুঃখিত ভাই, এটা আমার দৈনিক খরচের সীমা ছাড়িয়ে গেছে।" },
      { en: "Cannot accept. Have a safe day ahead.", bn: "মেনে নেওয়া সম্ভব না। আপনার দিনটি নিরাপদ কাটুক।" },
      { en: "I'll try my luck with the next available bike. Bye.", bn: "পরের বাইকটায় ভাগ্য পরীক্ষা করি। আসি।" }
    ],
    small_talk: [
      { en: "Our quarterly performance review is today. Pure corporate stress!", bn: "আজকে আমাদের ত্রৈমাসিক পারফরম্যান্স রিভিউ। চরম কর্পোরেট চাপ!" },
      { en: "Did you notice the flyover ramp traffic getting heavier each week?", bn: "খেয়াল করেছেন ফ্লাইওভারের ওঠার মুখে প্রতি সপ্তাহেই জ্যাম বাড়ছে?" },
      { en: "If Bangladesh wins this test match, our boss might actually smile today.", bn: "বাংলাদেশ এই টেস্ট ম্যাচটা জিতলে আমাদের বস হয়তো আজকে একটু হাসবেন।" },
      { en: "Every morning on Dhaka roads feels like solving an optimization algorithm.", bn: "ঢাকার রাস্তায় প্রতিটা সকাল যেন একটা জটিল অপটিমাইজেশন অ্যালগরিদম সমাধান করা।" },
      { en: "Rain in Dhaka turns a 20-minute commute into a 2-hour survival test.", bn: "ঢাকায় একটু বৃষ্টি হলেই ২০ মিনিটের রাস্তা ২ ঘণ্টার টিকে থাকার লড়াই হয়ে যায়।" },
      { en: "Everyone in our office is following the cricket score on mobile apps.", bn: "আমাদের অফিসের সবাই মোবাইলের অ্যাপে ক্রিকেট স্কোর নিয়ে মেতে আছে।" },
      { en: "My daughter has her school annual exam starting Monday morning.", bn: "সোমবারে সকাল থেকে আমার মেয়ের স্কুলের বার্ষিক পরীক্ষা শুরু।" },
      { en: "Look at that intersection, two bus drivers having an ego battle!", bn: "ঐ মোড়ে দেখেন, দুই বাস ড্রাইভারের ইগোর লড়াই চলছে!" },
      { en: "A cup of office coffee never beats tea from a street stall.", bn: "অফিসের দামি কফিও রাস্তার টঙের চায়ের স্বাদ ছুঁতে পারে না।" },
      { en: "Inflation is real when lunch boxes cost double what they used to.", bn: "লাঞ্চ বক্সের দাম যখন দ্বিগুণ হয়ে যায় তখন বোঝা যায় মূল্যস্ফীতি কী জিনিস।" },
      { en: "The metro rail helped, but last-mile bikes like yours keep Dhaka moving.", bn: "মেট্রো রেল অনেক সাহায্য করেছে, তবে শেষ মাইলের জন্য আপনাদের বাইকই ভরসা।" },
      { en: "I was replying to emails on my phone while we waited at the signal.", bn: "সিগন্যালে দাঁড়িয়ে থাকার সময়টুকুতে মোবাইলে তিনটা ইমেইলের উত্তর দিলাম।" },
      { en: "If you work hard in Dhaka, you can build a decent future despite the chaos.", bn: "ঢাকায় সৎভাবে পরিশ্রম করলে হাজারো বিশৃঙ্খলার মধ্যেও সুন্দর ভবিষ্যৎ গড়া যায়।" },
      { en: "Hope it doesn't pour rain this evening when everyone heads home.", bn: "সন্ধ্যায় অফিস ছুটির সময় যেন ঝুম বৃষ্টি না নামে, সেই দোয়াই করছি।" },
      { en: "Staying calm on these roads is a real mental health exercise!", bn: "এই রাস্তায় মেজাজ ঠান্ডা রাখাটাই একটা বড় মানসিক সাধনা!" }
    ],
    drop_off: [
      { en: "Right at the lobby entrance, please. Exactly ৳{fare} in cash.", bn: "লবির গেটের সামনে নামিয়ে দিন প্লিজ। ঠিক ৳{fare} টাকা নগদে দিচ্ছি।" },
      { en: "Thanks for saving my morning presentation! Keep the change.", bn: "সকালের প্রেজেন্টেশনটা বাঁচিয়ে দিলেন! বাকি খুচরাটা রেখে দিন।" },
      { en: "Appreciated your sharp navigation through the shortcuts.", bn: "শর্টকাট দিয়ে দারুণভাবে ড্রাইভ করে আনার জন্য ধন্যবাদ।" },
      { en: "Reached 10 minutes ahead of schedule. Excellent driving!", bn: "সময়ের ১০ মিনিট আগেই পৌঁছালাম। চমৎকার ড্রাইভ করেছেন!" },
      { en: "Here is your payment. Safe trips for the rest of your shift.", bn: "এই নিন আপনার পেমেন্ট। সারাদিনের বাকি রাইডগুলো নিরাপদ কাটুক।" },
      { en: "Professional ride, brother. Giving you five stars on the app.", bn: "খুবই পেশাদার রাইড ছিল ভাই। অ্যাপে ফাইভ স্টার দিয়ে দিচ্ছি।" },
      { en: "Saved me from an uncomfortable reprimand from the boss. Thanks!", bn: "বসের ঝাড়ি খাওয়ার হাত থেকে আজকে বাঁচিয়ে দিলেন। অনেক ধন্যবাদ!" },
      { en: "Payment transferred. Take care and stay hydrated today.", bn: "পেমেন্ট দিলাম ভাই। সাবধানে থাকবেন আর রোদ থেকে বেঁচে চলবেন।" },
      { en: "Dropped me right on the spot. Great riding, brother!", bn: "একদম সঠিক জায়গায় নামিয়ে দিলেন। দারুণ ড্রাইভ ভাই!" },
      { en: "Here is ৳{fare}. Hope your daily target gets reached soon.", bn: "এই নেন ৳{fare} টাকা। আপনার সারাদিনের টার্গেট যেন দ্রুত পূরণ হয়।" },
      { en: "Smooth braking and good awareness. Much obliged!", bn: "স্মুথ ব্রেকিং আর সচেতনভাবে চালিয়েছেন। কৃতজ্ঞ থাকলাম!" },
      { en: "Take care out there in the heat, brother.", bn: "এই তপ্ত রোদের মধ্যে সাবধানে চালাবেন ভাই।" },
      { en: "Payment complete. Have a productive working day!", bn: "পেমেন্ট সম্পন্ন। আপনার কাজের দিনটি ফলপ্রসূ হোক!" },
      { en: "Thanks a ton! See you next time I'm in a rush.", bn: "অনেক ধন্যবাদ! পরের বার তাড়াহুড়ো থাকলে আবার দেখা হবে।" },
      { en: "Fare settled. Keep driving responsibly on Dhaka streets.", bn: "ভাড়া পরিশোধ। ঢাকার রাস্তায় এভাবেই দায়িত্ব নিয়ে চালাবেন।" }
    ]
  },

  careful: {
    greeting: [
      { en: "Brother, will you go to {destination}? Please ride slowly and safely.", bn: "ভাই, {destination} যাবেন? দয়া করে একটু সাবধানে আর আস্তে চালাবেন।" },
      { en: "Assalamu Alaikum. Do you have a secure passenger helmet with strap?", bn: "আসসালামু আলাইকুম। স্ট্র্যাপসহ ভালো মানের একটা যাত্রীর হেলমেট আছে?" },
      { en: "Hello brother. I get nervous with sudden speeding, can you drive calm?", bn: "হ্যালো ভাই। হুট করে গতি বাড়ালে আমার ভয় লাগে, একটু শান্তভাবে চালাবেন?" },
      { en: "Going towards {destination}. No rush at all, safety is my priority.", bn: "{destination}-এর দিকে যাব। কোনো তাড়া নাই, নিরাপত্তাই আসল কথা।" },
      { en: "Brother, I have elderly joints, please avoid deep road potholes.", bn: "ভাই, আমার হাঁটুতে ব্যথা, ভাঙাচোরা গর্তগুলো একটু সাবধানে পার করবেন।" },
      { en: "Looking for a sensible rider who respects speed limits.", bn: "এমন একজন সুবিবেচক রাইডার খুঁজছি যিনি অতিরিক্ত গতি তোলেন না।" },
      { en: "Peace be upon you brother. Will you take a careful passenger today?", bn: "আপনার ওপর শান্তি বর্ষিত হোক ভাই। একজন সতর্ক যাত্রীকে নিয়ে যাবেন?" },
      { en: "Please no aggressive overtaking from the left side, brother.", bn: "বাম পাশ দিয়ে ওভারটেক না করলে আমি আপনার বাইকে যেতে রাজি ভাই।" },
      { en: "Brother, take me along if your brakes and tires are in good order.", bn: "ভাই, আপনার বাইকের ব্রেক আর চাকা ঠিকঠাক থাকলে আমাকে নিয়ে চলুন।" },
      { en: "I am traveling to visit my family. Steady riding preferred.", bn: "পরিবারের কাছে যাচ্ছি ভাই। ধীরে-সুস্থে গেলেই চলবে।" },
      { en: "Brother, can we travel without abrupt turns?", bn: "ভাই, হুটহাট তীব্র বাঁক না নিয়ে যাওয়া যাবে তো?" },
      { en: "Going to the medical clinic near {destination}. Need a calm driver.", bn: "{destination}-এর কাছে ক্লিনিকে যাব। একজন ধীরস্থির চালক প্রয়োজন।" },
      { en: "Hello brother! I prefer a rider who stops at traffic lights.", bn: "হ্যালো ভাই! ট্রাফিক সিগন্যাল মেনে চলেন এমন রাইডার পছন্দ করি।" },
      { en: "Can you provide a clean helmet? I will pay a fair rate.", bn: "পরিষ্কার একটা হেলমেট দিতে পারবেন? আমি ন্যায্য ভাড়াই দেব।" },
      { en: "Brother, let's reach safe and sound, that is all I ask.", bn: "ভাই, নিরাপদে আর সুস্থভাবে পৌঁছানোই আমার একমাত্র চাওয়া।" }
    ],
    offer: [
      { en: "I can give ৳{offer}. All I ask is steady, responsible riding.", bn: "আমি ৳{offer} টাকা দিতে রাজি। শুধু সাবধানে আর দায়িত্ব নিয়ে চালাবেন।" },
      { en: "App says ৳{fare}, I will gladly pay ৳{offer} for gentle driving.", bn: "অ্যাপে ৳{fare} দেখাচ্ছে, শান্তভাবে চালালে আমি ৳{offer} দিতেও প্রস্তুত।" },
      { en: "How about ৳{offer}? Please don't speed on the wet asphalt.", bn: "৳{offer} হলে কেমন হয়? শুধু ভেজা রাস্তায় জোরে টানবেন না।" },
      { en: "I will offer ৳{offer} if we avoid the dangerous construction detour.", bn: "বিপজ্জনক ভাঙা রাস্তা এড়িয়ে চললে আমি ৳{offer} দিতে রাজি।" },
      { en: "Here is ৳{offer}. Keep both hands on handlebars and ride calm.", bn: "এই যে ৳{offer} টাকা। দুই হাতে হ্যান্ডেল ধরে শান্তভাবে চালাবেন।" },
      { en: "Offering ৳{offer}. Please don't rush through yellow signals.", bn: "আমি ৳{offer} দিচ্ছি ভাই। হলুদ বাতিতে ঝুঁকি নিয়ে পার হবেন না।" },
      { en: "Take ৳{offer}, brother. Safety is worth every taka to me.", bn: "৳{offer} টাকা নিন ভাই। নিরাপত্তার মূল্য আমার কাছে সবকিছুর ওপরে।" },
      { en: "Will ৳{offer} suffice? Please maintain a safe distance from trucks.", bn: "৳{offer} টাকায় হবে ভাই? বড় ট্রাকগুলো থেকে নিরাপদ দূরত্ব রাখবেন।" },
      { en: "I offer ৳{offer}. We can take the safer, well-lit main avenue.", bn: "আমার অফার ৳{offer}। আলো ঝলমলে মূল সড়ক দিয়েই চলেন।" },
      { en: "How about ৳{offer}? Slow down near school crossings, please.", bn: "৳{offer} টাকা হলে কেমন হয়? স্কুলের সামনে একটু আস্তে চালাবেন।" },
      { en: "I can afford ৳{offer}. No need to race other motorbikes.", bn: "আমি ৳{offer} টাকা দিচ্ছি। অন্য বাইকের সাথে পাল্লা দেওয়ার দরকার নাই।" },
      { en: "Take ৳{offer} brother, and drive with patience and care.", bn: "৳{offer} টাকা নেন ভাই, একটু ধৈর্য আর সতর্কতা নিয়ে চালান।" },
      { en: "Offering ৳{offer}. Please wear your own helmet properly too.", bn: "৳{offer} প্রস্তাব করছি। আপনি নিজেও হেলমেটটা ভালো করে আটকান।" },
      { en: "I'll give ৳{offer}. Just ensure a smooth ride over speed breakers.", bn: "আমি ৳{offer} দেব। স্পিডব্রেকারগুলোতে যেন বেশি ঝাঁকুনি না লাগে।" },
      { en: "Here is ৳{offer}. Life is precious, let's ride safely.", bn: "এই নিন ৳{offer}। জীবনের দাম অনেক, আসেন নিরাপদে যাই।" }
    ],
    counter: [
      { en: "৳{fare}? If you promise to drive smoothly, I can do ৳{counter}.", bn: "৳{fare}? আপনি যদি শান্তভাবে চালান, তবে আমি ৳{counter} দিতে রাজি।" },
      { en: "Let's agree on ৳{counter}. Just promise not to overtake blindly.", bn: "৳{counter} টাকায় রাজি হই চলেন। শুধু অন্ধের মতো ওভারটেক করবেন না।" },
      { en: "I can stretch to ৳{counter}, as long as speed stays below 40 km/h.", bn: "গতি ৪০-এর নিচে রাখলে আমি ৳{counter} পর্যন্ত দিতে পারি ভাই।" },
      { en: "Brother, ৳{counter} is reasonable for a relaxed ride.", bn: "ভাই, ধীরস্থিরভাবে যাওয়ার জন্য ৳{counter} টাকা খুবই ন্যায্য।" },
      { en: "Make it ৳{counter}. I value a careful driver over a reckless speeder.", bn: "৳{counter} রাখেন। বেপরোয়া চালকের চেয়ে সতর্ক চালককে আমি বেশি কদর করি।" },
      { en: "I will pay ৳{counter}. Please don't brake sharply on gravel.", bn: "আমি ৳{counter} দেব। ভাঙা খোয়ার রাস্তায় হঠাৎ কষে ব্রেক করবেন না।" },
      { en: "How about ৳{counter}? Keep us safe from the speeding city buses.", bn: "৳{counter} হলে কেমন হয়? বেপরোয়া বাসগুলো থেকে আমাদের নিরাপদে রাখবেন।" },
      { en: "Let's settle at ৳{counter}. A gentle ride is all I need.", bn: "৳{counter} টাকায় রফা করি। একটা আরামদায়ক রাইডই আমার প্রয়োজন।" },
      { en: "I'll do ৳{counter}. Please fasten the chin strap securely.", bn: "আমি ৳{counter} দিচ্ছি। হেলমেটের বেল্টটা ভালো করে বেঁধে নিন।" },
      { en: "Would ৳{counter} work? Take the longer, well-paved route if needed.", bn: "৳{counter} হলে চলবে? দরকার হলে একটু ঘুরে ভালো রাস্তা দিয়ে নিয়েন।" },
      { en: "I can agree to ৳{counter}. Let's avoid any risky lane filtering.", bn: "৳{counter}-এ আমি সম্মত। যানবাহনের মাঝখান দিয়ে ঝুঁকি নিয়ে ঢুকবেন না।" },
      { en: "Take ৳{counter}, brother. Slow and steady reaches home safe.", bn: "৳{counter} টাকা নেন ভাই। আস্তে চললে তবেই তো সহি-সালামতে ঘরে ফেরা যায়।" },
      { en: "I offer ৳{counter}. Please signal early before making turns.", bn: "আমি ৳{counter} দিচ্ছি। ডানে-বামে ঘোরার আগে একটু আগে থেকেই ইন্ডিকেটর দিয়েন।" },
      { en: "Let's do ৳{counter}. No reckless maneuvers, please.", bn: "৳{counter} টাকায় চলেন ভাই। কোনো প্রকার বিপজ্জনক কসরত করবেন না।" },
      { en: "৳{counter} is fair. Peace of mind is important on these roads.", bn: "৳{counter} ন্যায্য। এই রাস্তায় মনের শান্তি বজায় রেখে চলাই বড় কথা।" }
    ],
    accept: [
      { en: "Agreed, brother. Thank you for listening to my safety concerns.", bn: "রাজি ভাই। আমার নিরাপত্তার কথা বিবেচনায় নেওয়ার জন্য ধন্যবাদ।" },
      { en: "Deal accepted. Let's fasten our helmets and start gently.", bn: "সম্মত হলাম। হেলমেটটা ভালো করে বেঁধে আস্তে ধীরে স্টার্ট দেন।" },
      { en: "Very well. Remember, no rush at all during the journey.", bn: "বেশ তো। মনে রাখবেন, পুরো রাস্তায় কোনো প্রকার তাড়াহুড়ো নাই।" },
      { en: "Accepted. Your polite behavior gives me confidence.", bn: "রাজি হলাম। আপনার ভদ্র ব্যবহারে আমার ভরসা হচ্ছে।" },
      { en: "Done. Let's drive in the middle of our lane, please.", bn: "পাক্কা। দয়া করে নিজের লেন বজায় রেখে চলবেন।" },
      { en: "Agreed brother. I appreciate your calm demeanor.", bn: "সম্মতি দিলাম ভাই। আপনার শান্ত স্বভাবটা আমার বেশ পছন্দ হয়েছে।" },
      { en: "Fair deal. May the Almighty grant us a safe trip.", bn: "ন্যায্য চুক্তি। মহান আল্লাহ আমাদের যাত্রাকে নিরাপদ রাখুন।" },
      { en: "Okay brother, getting on carefully now. Take off smoothly.", bn: "ঠিক আছে ভাই, সাবধানে উঠছি। আস্তে করে পিক-আপ বাড়াবেন।" },
      { en: "Accepted. Let's respect other pedestrians and rickshaws.", bn: "মেনে নিলাম। পথচারী আর রিকশাওয়ালাদের একটু সম্মান দিয়ে চলেন।" },
      { en: "Deal fixed. A careful rider is a true blessing in Dhaka.", bn: "চুক্তি চূড়ান্ত। ঢাকায় একজন সতর্ক চালক পাওয়া সত্যিই বড় নেয়ামত।" },
      { en: "Alright, let's proceed. I have full faith in your caution.", bn: "বেশ, এগোনো যাক। আপনার সতর্কতার ওপর আমার পূর্ণ ভরসা আছে।" },
      { en: "Accepted! Let's watch for open manholes along the roadside.", bn: "রাজি! রাস্তার ধারের খোলা ম্যানহোলগুলো একটু সাবধানে খেয়াল রাখবেন।" },
      { en: "Agreed. Thank you for offering a clean, sturdy helmet.", bn: "সম্মত হলাম। মজবুত আর পরিষ্কার হেলমেট দেওয়ার জন্য কৃতজ্ঞতা।" },
      { en: "Good agreement, brother. Let's keep our journey peaceful.", bn: "সুন্দর চুক্তি ভাই। যাত্রাটা যেন শান্তিময় কাটে।" },
      { en: "Deal done. Safe driving brings blessings to your earnings.", bn: "কথা পাক্কা। নিরাপদ চালনায় আপনার উপার্জনেও বরকত আসে।" }
    ],
    reject: [
      { en: "I don't feel confident with that response. I'll wait for another ride.", bn: "আপনার কথায় আমার ভরসা হচ্ছে না ভাই। আমি বরং অন্য গাড়ি দেখি।" },
      { en: "Your bike seems to have worn-out tires. I must decline, sorry.", bn: "আপনার বাইকের টায়ারের গ্রিপ তো ক্ষয়ে গেছে। আমি যেতে পারব না, দুঃখিত।" },
      { en: "You seem in a rush to speed. That scares me, declining.", bn: "আপনার খুব তাড়াহুড়ো দেখাচ্ছে। এতে আমার ভয় করে, না বললাম।" },
      { en: "No helmet strap available? Then I cannot take this ride.", bn: "হেলমেটের বেল্ট ভাঙা? তাহলে আমি এই রাইডে উঠতে পারছি না।" },
      { en: "Too high fare, and safety wasn't assured. Declining.", bn: "ভাড়াও বেশি, আবার নিরাপত্তার কোনো আশ্বাসও নাই। বাতিল করলাম।" },
      { en: "Sorry brother, I prefer an older, more conservative rider.", bn: "দুঃখিত ভাই, আমি আরেকটু ধীরস্থির অভিজ্ঞ কাউকে খুঁজছি।" },
      { en: "I'll take an auto-rickshaw instead for safety. Good day.", bn: "নিরাপত্তার স্বার্থে আমি বরং সিএনজি অটোরিকশাই নেব। ভালো থাকবেন।" },
      { en: "Cannot take the risk today, brother. Safe travels.", bn: "আজকে এই ঝুঁকি নেওয়া সম্ভব না ভাই। আপনার যাত্রা শুভ হোক।" },
      { en: "Declining. Please don't be offended, my health is fragile.", bn: "না বলছি। কিছু মনে করবেন না ভাই, আমার শরীরটা একটু দুর্বল।" },
      { en: "No brother, let's part ways. Have a safe day.", bn: "না ভাই, বনিবনা হলো না। সাবধানে থাকবেন।" },
      { en: "The speed you ride at doesn't suit my comfort. Bye.", bn: "আপনার গতি হয়তো আমার সহ্য হবে না। আসি।" },
      { en: "I'll wait for a CNG or bus where I feel more secure.", bn: "আমি বরং বাস বা সিএনজির জন্য অপেক্ষা করি, ওখানেই নিরাপদ বোধ করব।" },
      { en: "Sorry brother, cannot agree on these terms.", bn: "দুঃখিত ভাই, এই শর্তে আমি রাজি হতে পারছি না।" },
      { en: "Life comes before saving 10 minutes. I will decline.", bn: "১০ মিনিট বাঁচানোর চেয়ে জীবনের মূল্য অনেক বেশি। না করলাম।" },
      { en: "No deal today brother. Please drive carefully on the road.", bn: "আজকে আর হলো না ভাই। রাস্তায় দয়া করে সাবধানে চালাবেন।" }
    ],
    small_talk: [
      { en: "Speed breakers in this city are built without any standard markings!", bn: "এই শহরের স্পিডব্রেকারগুলোতে কোনো সাদা দাগ দেওয়া থাকে না!" },
      { en: "My grandson is studying for his medical college admission test.", bn: "আমার নাতি মেডিকেল কলেজ ভর্তি পরীক্ষার জন্য দিনরাত পড়ছে।" },
      { en: "A careful driver is respected by everyone on the road.", bn: "সতর্ক চালককে রাস্তার সবাই মনে মনে শ্রদ্ধা করে।" },
      { en: "When it rains, diesel spills make the asphalt like polished glass.", bn: "বৃষ্টি হলে বাসের ফেলে দেওয়া ডিজেলে পিচ রাস্তা কাচের মতো পিচ্ছিল হয়।" },
      { en: "Did you hear Bangladesh cricket team bowled with great discipline?", bn: "শুনেছেন বাংলাদেশ ক্রিকেট টিম আজকে কী দুর্দান্ত বোলিং ডিসিপ্লিন দেখিয়েছে?" },
      { en: "Family waiting at home is the best reason never to overspeed.", bn: "ঘরে পরিবার অপেক্ষায় থাকে—অতিরিক্ত গতি না তোলার জন্য এর চেয়ে বড় কারণ আর নাই।" },
      { en: "Health is the true wealth. A small fracture takes months to heal.", bn: "স্বাস্থ্যই আসল সম্পদ। একটা ছোট হাড়ের চোট সারতেই তো কয়েকমাস লাগে।" },
      { en: "Look at those school children crossing hand in hand. Beautiful sight.", bn: "হাত ধরে স্কুল পার হওয়া বাচ্চাগুলোকে দেখেন। কী চমৎকার দৃশ্য।" },
      { en: "Patience behind the handlebars saves fuel and lives alike.", bn: "হ্যান্ডেলবারের পেছনে ধৈর্য ধরলে তেল আর জীবন দুটোই বাঁচে।" },
      { en: "My late father always said: reach ten minutes late, not sixty years early.", bn: "আমার মরহুম বাবা বলতেন: দশ মিনিট পরে পৌঁছাও, কিন্তু ষাট বছর আগে চলে যেও না।" },
      { en: "Dhaka air gets heavy in winter, but today feels a bit fresher.", bn: "শীতকালে ঢাকার বাতাস ভারী হয়ে যায়, তবে আজকের দিনটা বেশ ফুরফুরে।" },
      { en: "The traffic sergeant at this intersection is very polite and honest.", bn: "এই মোড়ের ট্রাফিক সার্জেন্ট কিন্তু খুবই ভদ্র আর সৎ মানুষ।" },
      { en: "Taking ginger tea with honey keeps the throat clear of city dust.", bn: "মধু দিয়ে আদা চা খেলে শহরের ধুলোবালির হাত থেকে গলা পরিষ্কার থাকে।" },
      { en: "Life's journey is just like traffic: slow down and look both ways.", bn: "জীবনের পথচলাও তো ট্রাফিকের মতো: গতি কমিয়ে দুই পাশ দেখে চলতে হয়।" },
      { en: "I appreciate your calm driving so much, brother. May you prosper.", bn: "আপনার ধীরস্থির চালনা দেখে মনটা ভরে গেল ভাই। আপনার উন্নতি হোক।" }
    ],
    drop_off: [
      { en: "Here is your ৳{fare}, brother. May God bless your hands and ride.", bn: "এই নেন আপনার ৳{fare} টাকা ভাই। আল্লাহ আপনার উপার্জনে বরকত দিন।" },
      { en: "Such gentle driving! I didn't feel a single hard jerk.", bn: "কী চমৎকার শান্ত ড্রাইভ! একটা ঝাঁকুনিও গায়ে লাগেনি।" },
      { en: "Keep the change brother, you earned every bit of my respect.", bn: "ভাংতি টাকাটা রেখে দেন ভাই, আপনার সম্মানজনক ড্রাইভের কদর করি।" },
      { en: "Dropped me right in front of the gate. Thank you immensely!", bn: "একদম গেটের সামনে নামিয়ে দিলেন। আপনার প্রতি অনেক কৃতজ্ঞতা!" },
      { en: "May God keep you safe from all road accidents, brother.", bn: "আল্লাহ আপনাকে রাস্তার যাবতীয় দুর্ঘটনা থেকে হেফাজতে রাখুন ভাই।" },
      { en: "Here is your money. Always keep this calm attitude on the bike.", bn: "এই নিন আপনার ভাড়া। বাইকে সবসময় এই ধৈর্য বজায় রাখবেন।" },
      { en: "I will pray for your safe livelihood today, young brother.", bn: "আপনার হালাল রুজির নিরাপত্তার জন্য দোয়া করব ছোট ভাই।" },
      { en: "Payment made. Thank you for waiting at the pedestrian crossing.", bn: "পেমেন্ট দিলাম ভাই। জেব্রা ক্রসিংয়ে পথচারীদের জায়গা দেওয়ার জন্য ধন্যবাদ।" },
      { en: "A truly peaceful ride. Have a blessed and profitable day!", bn: "সত্যিই এক শান্তিময় সফর ছিল। আপনার দিনটি বরকতময় কাটুক!" },
      { en: "Here is ৳{fare}. You made an elderly person's travel so comfortable.", bn: "এই নেন ৳{fare} টাকা। বয়স্ক মানুষকে আপনি দারুণ আরামদায়ক সফর দিলেন।" },
      { en: "Safe braking and great patience. God protect you always.", bn: "চমৎকার ব্রেকিং আর সীমাহীন ধৈর্য। আল্লাহ সবসময় আপনাকে রক্ষা করুন।" },
      { en: "Here is the exact fare. Take care on these crowded streets.", bn: "এই নেন খাঁটি ভাড়া। এই ভিড়ের রাস্তায় নিজের খেয়াল রাখবেন।" },
      { en: "Thank you brother! I felt secure throughout the entire trip.", bn: "ধন্যবাদ ভাই! পুরোটা পথ আমি পূর্ণ নিরাপত্তা বোধ করেছি।" },
      { en: "May your bike carry you safely home to your family tonight.", bn: "আপনার বাইক যেন রাতে আপনাকে নিরাপদে পরিবারের কোলে ফিরিয়ে নেয়।" },
      { en: "Payment given with a grateful heart. Assalamu Alaikum!", bn: "কৃতজ্ঞ চিত্তে ভাড়াটা পরিশোধ করলাম। আসসালামু আলাইকুম!" }
    ]
  },

  regular: {
    greeting: [
      { en: "Mama! How are you doing today? Going towards {destination}?", bn: "মামা! আজকের দিন কেমন যাচ্ছে? {destination}-এর দিকে যাবেন নাকি?" },
      { en: "Hey brother! Saw your bike at Mintu's tea stall earlier. Free?", bn: "এই যে ভাই! একটু আগে মিন্টুর চায়ের দোকানে আপনার বাইক দেখলাম। ফাঁকা?" },
      { en: "Brother, regular rider of this neighbourhood! Take me to {destination}.", bn: "ভাই, এই পাড়ার নিয়মিত মানুষ! আমাকে একটু {destination} নামিয়ে দেন।" },
      { en: "Mama kemon acho? Let's take a quick spin to the bazaar.", bn: "মামা কেমন আছো? বাজারের দিকে চট করে একটু ঘুরে আসা যাক।" },
      { en: "Assalamu Alaikum brother! You know these inner alleys well, right?", bn: "আসসালামু আলাইকুম ভাই! ভেতরের অলিগলিগুলো তো আপনার চেনা, তাই না?" },
      { en: "Hey neighbour! Glad to catch someone from our own area.", bn: "এই যে প্রতিবেশী ভাই! নিজেদের এলাকার কাউকেই পেয়ে ভালো লাগল।" },
      { en: "Mama, give me a lift to the junction. Standard local ride.", bn: "মামা, মোড় পর্যন্ত একটু লিফট দাও। চেনা রুটের লোকাল সফর।" },
      { en: "Brother, remember me from yesterday? Need to go again today.", bn: "ভাই, কালকের কথা মনে আছে? আজকে আবার একটু যেতে হবে।" },
      { en: "Hey champion rider! Ready for another Dhaka run?", bn: "এই যে চ্যাম্পিয়ন রাইডার! ঢাকার রাস্তায় আরেকটা চক্কর দিতে রাজি?" },
      { en: "Mama, don't let a familiar face wait around in the dust!", bn: "মামা, পরিচিত মানুষকে আর ধুলার মধ্যে দাঁড় করিয়ে রেখো না!" },
      { en: "Peace brother. Headed to the workshop area, can you drop me?", bn: "সালাম ভাই। গ্যারেজের দিকে যাব, একটু নামিয়ে দেওয়া যাবে?" },
      { en: "Hey brother, let's take that shortcut behind the mosque.", bn: "এই যে ভাই, মসজিদের পেছনের শর্টকাটটা দিয়ে যাওয়া যাক।" },
      { en: "Mama, will you take a fellow local for a quick ride?", bn: "মামা, পাড়ার মানুষকে একটু চট করে নিয়ে যাবা?" },
      { en: "Brother, let's roll before the evening bazaar rush starts.", bn: "ভাই, সন্ধ্যার বাজারের ভিড় পড়ার আগেই কেটে পড়ি চলেন।" },
      { en: "Good to see you on the streets, brother! Free for a ride?", bn: "রাস্তায় আপনাকে দেখে ভালো লাগল ভাই! একটা ট্রিপ দেবেন?" }
    ],
    offer: [
      { en: "Mama, the usual ৳{offer} like always between friends, right?", bn: "মামা, পরিচিতের মধ্যে সবসময় যেমন ৳{offer} হয়, তেমনই তো?" },
      { en: "I'll give our neighbourhood rate ৳{offer}. Let's go.", bn: "পাড়ার রেট ৳{offer} টাকা দিচ্ছি ভাই। চলেন যাই।" },
      { en: "App shows ৳{fare}, but between us locals, ৳{offer} is fair.", bn: "অ্যাপে ৳{fare} দেখাচ্ছে, কিন্তু আমাদের পাড়ার মধ্যে ৳{offer} একদম ঠিক।" },
      { en: "How about ৳{offer}? I'll buy you a special milk tea at Mintu's!", bn: "৳{offer} হলে কেমন হয়? মিন্টুর দোকানে স্পেশাল মালাই চা খাওয়াব!" },
      { en: "Brother, ৳{offer} as usual. We both know this short stretch.", bn: "ভাই, বরাবরের মতো ৳{offer}। এই ছোট রাস্তা তো আমরা দুজনেই চিনি।" },
      { en: "Let's do ৳{offer}. Keep it in the family, skip the app fee.", bn: "৳{offer} করে দেন ভাই। নিজেদের মধ্যেই থাকুক, অ্যাপের ফি বেঁচে গেল।" },
      { en: "Offering ৳{offer}. You know I always pay on the dot.", bn: "৳{offer} দিচ্ছি। আপনি তো জানেনই আমার টাকা কখনো আটকে থাকে না।" },
      { en: "Mama, take ৳{offer} and let's go. We're from the same para!", bn: "মামা, ৳{offer} নাও আর চল। আমরা তো একই পাড়ার মানুষ!" },
      { en: "How about ৳{offer}? I know every shortcut on this route.", bn: "৳{offer} টাকা হলে কেমন হয়? এই রুটের সব শর্টকাট আমার মুখস্থ।" },
      { en: "I can offer ৳{offer} today. Don't say no to an old friend.", bn: "আজকে ৳{offer} দিচ্ছি ভাই। পুরনো পরিচিতকে না করবেন না।" },
      { en: "Let's settle on ৳{offer}. Fair for the bike, easy on my pocket.", bn: "৳{offer}-এ চুক্তি হোক। বাইকের তেলের জন্যও ভালো, আমার পকেটেও টান না।" },
      { en: "Take ৳{offer}, mama. I have the exact note ready in hand.", bn: "৳{offer} নাও মামা। একদম খাঁটি নোট হাতে নিয়ে বসে আছি।" },
      { en: "Brother, ৳{offer} is the honest local price. Agreed?", bn: "ভাই, ৳{offer} টাকা এলাকার একদম সৎ দাম। রাজি তো?" },
      { en: "Give me the neighbourhood discount: ৳{offer} and we ride.", bn: "পাড়ার মানুষের খাতিরটা দেন: ৳{offer} রাখলেই উঠে পড়ি।" },
      { en: "I propose ৳{offer}. You can take the shortcut behind the park.", bn: "আমার অফার ৳{offer}। পার্কের পেছনের শর্টকাট দিয়ে চলে যেতে পারেন।" }
    ],
    counter: [
      { en: "Mama, ৳{fare}? Don't fleece your own regular, make it ৳{counter}!", bn: "মামা, ৳{fare}? নিজের এলাকার নিয়মিত যাত্রীর কাছে বেশি নিও না, ৳{counter} রাখো!" },
      { en: "Split it to ৳{counter}, brother. We meet every day anyway.", bn: "৳{counter} টাকায় রফা করেন ভাই। প্রতিদিন তো রাস্তায় দেখাই হয়।" },
      { en: "Come on mama, ৳{counter} is plenty for a 5-minute hop.", bn: "কি যে করো মামা, ৫ মিনিটের রাস্তায় ৳{counter} টাকাই তো অনেক।" },
      { en: "Brother, make it ৳{counter} and I'll recommend you to everyone.", bn: "ভাই, ৳{counter} রাখেন, পাড়ার সবাইকে আপনার রেফারেন্স দেব।" },
      { en: "Let's do ৳{counter}. I won't haggle with my own neighbourhood rider.", bn: "৳{counter} করেন ভাই। নিজের এলাকার রাইডারের সাথে আর দরদাম বাড়াব না।" },
      { en: "How about ৳{counter}? It leaves enough for both of us.", bn: "৳{counter} হলে কেমন হয়? দুজনেরই একটা ভালো হিসেব দাঁড়ায়।" },
      { en: "Mama, ৳{counter} final! Hop on and let's roll.", bn: "মামা, ৳{counter} শেষ কথা! এবার বাইকে টান দাও।" },
      { en: "Make it ৳{counter}, brother. You know my situation at home.", bn: "৳{counter} রাখেন ভাই। আমার সংসারের অবস্থা তো আপনার জানাই আছে।" },
      { en: "I can do ৳{counter}. Let's not make strangers out of locals.", bn: "আমি ৳{counter} দিতে পারি। নিজেদের মানুষকে তো আর অচেনা করা যায় না।" },
      { en: "Take ৳{counter}, brother. Time to hit the gas.", bn: "৳{counter} নেন ভাই। এবার পিক-আপে হাত লাগান।" },
      { en: "Okay, ৳{counter} and you tell me what happened at the club.", bn: "ঠিক আছে, ৳{counter} দিচ্ছি, ক্লাবে কী ঘটল যাওয়ার পথে শুনব।" },
      { en: "Let's meet at ৳{counter}. Honour our local relationship.", bn: "৳{counter}-এ মিল করি। পাড়ার সম্পর্কের খাতিরে রাজি হয়ে যান।" },
      { en: "৳{counter} is fair, mama. Don't be too strict today.", bn: "৳{counter} একদম ঠিক মামা। আজকে আর কড়াকড়ি করো না।" },
      { en: "I stretch to ৳{counter}. Let's shake hands like brothers.", bn: "টেনে ৳{counter} করলাম। ভাইয়ের মতো হাত মেলাও এবার।" },
      { en: "Make it ৳{counter} and let's fly through the back alleys.", bn: "৳{counter} রাখেন, পেছনের চিপাগলি দিয়ে উড়ে চলে যাই।" }
    ],
    accept: [
      { en: "Now that's my mama! Hand over the helmet, let's roll.", bn: "এই তো আমার মামা! হেলমেটটা দাও, চলেন যাই।" },
      { en: "Deal done, brother! Good understanding between regulars.", bn: "চুক্তি পাক্কা ভাই! চেনা মানুষের মধ্যে বোঝাপড়াই আলাদা।" },
      { en: "Agreed! Let's take the alley behind the sweet shop.", bn: "রাজি! মিষ্টির দোকানের পেছনের গলিটা দিয়ে চলেন।" },
      { en: "Done deal. Always a pleasure riding with you, brother.", bn: "কথা শেষ। আপনার সাথে রাইড নেওয়া সবসময়ই আনন্দের ভাই।" },
      { en: "Settled! Let's go before the tea at the stall gets cold.", bn: "রফা হয়ে গেল! চায়ের স্টলের চা জুড়ানোর আগেই ফিরতে হবে।" },
      { en: "Accepted, mama! You are the pride of our neighbourhood.", bn: "মেনে নিলাম মামা! তুমি তো আমাদের পাড়ার গর্ব।" },
      { en: "Agreed. Let's show these outsiders how to navigate Dhaka!", bn: "সম্মত হলাম। বাইরের লোকদের দেখিয়ে দেই ঢাকা কীভাবে চষে ফেলতে হয়!" },
      { en: "Deal fixed. Hopping on behind you now, brother.", bn: "ডিল চূড়ান্ত। আপনার পেছনে উঠে পড়লাম ভাই।" },
      { en: "Fine with me! Regulars always get the best journey.", bn: "আমার একদম পছন্দ! পরিচিত যাত্রীরাই সবচেয়ে সেরা সফর পায়।" },
      { en: "Accepted! Let's weave through before the truck enters.", bn: "কবুল! বড় ট্রাক ঢোকার আগেই গলিটা পার হয়ে যাই।" },
      { en: "Alright brother, let's roll. Dhaka roads belong to us!", bn: "ঠিক আছে ভাই, চলেন। ঢাকার রাস্তা তো আমাদেরই চেনা!" },
      { en: "Agreed, mama! Keep your engine humming sweet.", bn: "রাজি মামা! ইঞ্জিনের আওয়াজটা ধরে রাখো।" },
      { en: "That works. Let's make this a quick, breezy ride.", bn: "হয়ে গেল। ঝড়ের মতো চটজলদি পৌঁছে যাই চলেন।" },
      { en: "Deal closed. Thanks for always accommodating a neighbour.", bn: "ডিল পাক্কা। পাড়ার মানুষের পাশে থাকার জন্য ধন্যবাদ ভাই।" },
      { en: "Accepted! Onward to {destination} with a smile.", bn: "রাজি! মুখে হাসি নিয়ে {destination}-এর দিকে এগোই চলেন।" }
    ],
    reject: [
      { en: "Arey mama, even from me you ask this much? Never mind today.", bn: "আরে মামা, আমার কাছ থেকেও এত চাইলা? আজকে থাক তবে।" },
      { en: "No brother, that's not our local rate. I'll walk it off.", bn: "না ভাই, এটা আমাদের পাড়ার দর না। হেঁটেই চলে যাই।" },
      { en: "Too high for an old neighbour! See you at the tea stall.", bn: "পুরনো প্রতিবেশীর কাছে এত ভাড়া! চায়ের টঙে দেখা হবে।" },
      { en: "Can't do it today, brother. Don't mind, budget is tight.", bn: "আজকে পারলাম না ভাই। কিছু মনে করবেন না, হাতে টান।" },
      { en: "No mama, I'll take Bablu's rickshaw instead. See ya!", bn: "না মামা, আমি বরং বাবলুর রিকশায় যাই। পরে কথা হবে!" },
      { en: "That fare is for tourists, brother! Not for someone from here.", bn: "এই ভাড়া তো বাইরের মানুষের জন্য ভাই! আমাদের মতো স্থানীয়দের জন্য না।" },
      { en: "Couldn't match terms today, brother. No hard feelings.", bn: "আজকে মিলল না ভাই। মনে কোনো কষ্ট নিয়েন না।" },
      { en: "No deal, mama. I have to save coins for groceries.", bn: "হলো না মামা। সংসারের সওদার জন্য টাকা বাঁচাতে হবে।" },
      { en: "Declining today, brother. Safe riding out there.", bn: "আজকে না বললাম ভাই। সাবধানে বাইক চালান।" },
      { en: "Too expensive this time. Let's catch up later evening.", bn: "এবার বেশি হয়ে গেল ভাই। সন্ধ্যায় আড্ডা হবে টঙে।" },
      { en: "Can't stretch it today, mama. Next time for sure.", bn: "আজকে টানতে পারলাম না মামা। পরের বার নিশ্চিত।" },
      { en: "No brother, thank you. I will walk through the alley.", bn: "না ভাই, ধন্যবাদ। গলি দিয়ে হেঁটেই পৌঁছানো যাবে।" },
      { en: "Doesn't work for me today. Take care of your bike!", bn: "আজকে মিলল না ভাই। বাইকের যত্ন নিয়েন!" },
      { en: "Sorry mama, wallet is feeling empty. Catch you later.", bn: "দুঃখিত মামা, মানিব্যাগটা একটু হালকা। পরে কথা হবে।" },
      { en: "Declining brother. May you find high-paying rides today.", bn: "না করলাম ভাই। আজকে আপনার বেশি ভাড়ার ভালো খ্যাপ মিলুক।" }
    ],
    small_talk: [
      { en: "Mintu's special tea stall gossip today is about the ward election!", bn: "মিন্টুর চায়ের দোকানে আজকের গরম খবর হলো ওয়ার্ড নির্বাচন!" },
      { en: "Did you hear Kamal bhai upgraded his workshop with a new air gun?", bn: "শুনেছেন কামাল ভাই গ্যারেজে নতুন এয়ার গান টুলস এনেছেন?" },
      { en: "That Shakib over in the last match reminded me of our youth cricket days.", bn: "গত ম্যাচে সাকিবের ঐ ওভারটা দেখে আমাদের ছোটবেলার পাড়ার ক্রিকেটের কথা মনে পড়ে গেল।" },
      { en: "The municipality dug up the water pipe again right after paving the road!", bn: "রাস্তা পিচ ঢালাই করার ঠিক পরদিনই ওয়াসা আবার পাইপ খুঁড়তে নামল!" },
      { en: "Monsoon waterlogging in our lane is legendary—you need a boat!", bn: "আমাদের গলিতে বর্ষার জলাবদ্ধতা তো দেখার মতো—বাইক না, নৌকা লাগে!" },
      { en: "Rahim chacha was telling everyone about his secret shortcut to Puran Para.", bn: "রহিম চাচা সবাইকে পুরান পাড়ায় যাওয়ার গোপন শর্টকাটের গল্প শোনাচ্ছিলেন।" },
      { en: "My younger brother passed his higher secondary exam with first class!", bn: "আমার ছোট ভাইটা উচ্চ মাধ্যমিকে ফার্স্ট ক্লাস পেয়ে পাস করেছে!" },
      { en: "Nothing in Dhaka beats fresh hot paratha and daal early in the morning.", bn: "সকালবেলায় গরম গরম পরোটা আর ডালভাজির স্বাদ ঢাকায় তুলনাহীন।" },
      { en: "Remember when that CNG tried to overtake three bikes at once? Madness!", bn: "মনে আছে ঐ সিএনজিটা একসাথে তিনটা বাইককে ওভারটেক করতে গিয়ে কী কাণ্ড করেছিল?" },
      { en: "If you keep your bike clean and engine tuned, Dhaka roads feel easier.", bn: "বাইকটা পরিষ্কার আর ইঞ্জিন টিউনড রাখলে ঢাকার রাস্তাও সহজ মনে হয়।" },
      { en: "Street vendors at the bazaar are selling the sweetest guavas this week.", bn: "বাজারে এবার হকাররা দারুণ মিষ্টি পেয়ারা এনেছে ভাই।" },
      { en: "Our para tournament starts next Friday. Everyone is practicing bowling.", bn: "সামনের শুক্রবারে পাড়ার টুর্নামেন্ট শুরু। সবাই এখন বোলিং প্র্যাকটিসে ব্যস্ত।" },
      { en: "No matter how much Dhaka changes, our tea stall brotherhood stays intact.", bn: "ঢাকা শহর যতই বদলাক, আমাদের চায়ের টঙের ভাই-বেরাদার সম্পর্ক বদলাবে না।" },
      { en: "Look at that sunset through the electric wires—pure Dhaka poetry!", bn: "বৈদ্যুতিক তারের ফাঁক দিয়ে সূর্যাস্তটা দেখেন—একদম খাঁটি ঢাকার কবিতা!" },
      { en: "Hard work with honest sweat: that's how we locals survive and thrive.", bn: "সৎ ঘামের ওপর ভরসা—এভাবেই তো আমরা পাড়ার মানুষ টিকে থাকি আর এগোই।" }
    ],
    drop_off: [
      { en: "Here is your ৳{fare}, mama. Take care and see you at Mintu's!", bn: "এই নাও তোমার ৳{fare} মামা। ভালো থেকো, মিন্টুর টঙে দেখা হবে!" },
      { en: "Thanks brother! Dropped me right at my door step.", bn: "ধন্যবাদ ভাই! একদম আমার ঘরের দরজায় নামিয়ে দিলেন।" },
      { en: "Keep the extra change for cigarettes or tea, mama.", bn: "বাড়তি ভাংতিটা তোমার চা-পানের জন্য রেখে দাও মামা।" },
      { en: "Always the best ride in the neighbourhood. Respect!", bn: "পাড়ার মধ্যে সবসময় আপনার রাইডটাই সেরা। শ্রদ্ধা রইল!" },
      { en: "Payment made. Tell Kamal bhai I said hello when you visit.", bn: "পেমেন্ট দিলাম ভাই। গ্যারেজে গেলে কামাল ভাইকে আমার সালাম দিয়েন।" },
      { en: "Right here is perfect. Catch you in the evening, brother!", bn: "এখানেই নামিয়ে দাও। সন্ধ্যায় দেখা হবে ভাই!" },
      { en: "Thanks a bunch mama! Great shortcut through the traffic.", bn: "অনেক ধন্যবাদ মামা! জ্যামের মধ্য দিয়ে দারুণ শর্টকাট মারলা।" },
      { en: "Here is your money. May your day be blessed with good rides.", bn: "এই নিন আপনার ভাড়া। সারাদিন যেন ভালো ভালো খ্যাপ পান।" },
      { en: "Familiar rider, smooth trip. Take care on the main highway!", bn: "চেনা রাইডার, ঝরঝরে সফর। বড় হাইওয়েতে সাবধানে থাকবেন!" },
      { en: "Here is ৳{fare}. Tell Rahim chacha his shortcut worked like magic.", bn: "এই নাও ৳{fare} টাকা। রহিম চাচাকে বলো উনার শর্টকাট জাদু দেখিয়েছে।" },
      { en: "Safe travels mama! Don't skip lunch in the hustle.", bn: "সাবধানে থেকো মামা! কাজের চাপে দুপুরের খাবারটা মিস করো না।" },
      { en: "Paid in full. You are our favourite neighbourhood biker!", bn: "পুরো ভাড়া পরিশোধ। আপনি কিন্তু আমাদের পাড়ার সবচেয়ে প্রিয় বাইকার!" },
      { en: "Thank you brother. Let's sit for tea together tonight.", bn: "ধন্যবাদ ভাই। আজকে রাতে একসাথে বসে চা খাওয়া যাবে।" },
      { en: "Exact fare handed over. Keep that bike shining!", bn: "একদম গুনে গুনে ভাড়া দিলাম। বাইকটা এভাবেই চকচকে রেখো!" },
      { en: "See you around mama! Safe journey ahead.", bn: "আবার দেখা হবে মামা! সামনের পথচলা নিরাপদ হোক।" }
    ]
  },

  risky: {
    greeting: [
      { en: "Yo brother! Need to reach {destination} FAST. Money is not an issue.", bn: "এই যে ভাই! {destination} খুব দ্রুত পৌঁছাতে হবে। টাকার কোনো সমস্যা নাই।" },
      { en: "Hey rider, twist that throttle and get me there before 11!", bn: "এই যে রাইডার, স্পিড বাড়াও আর আমাকে ১১টার আগেই ওখানে নামাও!" },
      { en: "Urgent rush to {destination}. Can you fly through the jams?", bn: "{destination} জরুরি কাজ। জ্যামের ওপর দিয়ে উড়ে যেতে পারবা?" },
      { en: "Brother, take this trip and I will make it worth your while.", bn: "ভাই, এই ট্রিপটা নেন, আপনার পকেট গরম করে দেব।" },
      { en: "Need a fearless rider who knows how to cut through lanes.", bn: "এমন সাহসী রাইডার দরকার যে গাড়ির ফাঁক দিয়ে দ্রুত বের হতে পারে।" },
      { en: "Listen brother, I have urgent business across town. You ready?", bn: "শোনেন ভাই, শহরের ওপারে একটা জরুরি কারবার আছে। তৈরি আছেন?" },
      { en: "Got a fast bike? Show me what that engine can do!", bn: "ভালো স্পিডের বাইক আছে তো? দেখি ইঞ্জিনের কী জোর!" },
      { en: "Hey boss, quick run to {destination}. Drop me in 15 minutes.", bn: "এই যে বস, {destination} চটজলদি দৌড়। ১৫ মিনিটের মধ্যে নামাতে হবে।" },
      { en: "Brother, skip the formalities, will you ride fast or what?", bn: "ভাই, কথা বাড়িয়ে লাভ নাই, দ্রুত টানতে পারবেন কি পারবেন না বলেন?" },
      { en: "Big tip on the table if we beat the traffic clock.", bn: "ট্রাফিকের আগে পৌঁছাতে পারলে বড় মাপের বকশিশ মিলবে।" },
      { en: "Need to reach the warehouse area immediately. Let's roll.", bn: "গুদাম এলাকায় এখনই পৌঁছানো জরুরি। চলেন স্টার্ট দেন।" },
      { en: "Brother, time is running out on a major deal. Step up!", bn: "ভাই, বড় একটা চুক্তির সময় ফুরিয়ে আসছে। চটপট ওঠেন!" },
      { en: "Looking for an adrenaline-pumping ride to {destination}!", bn: "{destination} যাওয়ার জন্য দম বন্ধ করা দ্রুত রাইড খুঁজছি!" },
      { en: "Hey, can you weave past those slow CNGs without hesitation?", bn: "ঐ ধীরগতির সিএনজিগুলোকে পাশ কাটিয়ে দ্রুত টানতে পারবেন?" },
      { en: "Let's make this trip quick. Cash is waiting in hand.", bn: "ট্রিপটা একদম দ্রুত শেষ করি। হাতে নগদ টাকা রেডি আছে।" }
    ],
    offer: [
      { en: "App says ৳{fare}? I will give you ৳{offer} if we fly there!", bn: "অ্যাপে ৳{fare}? দ্রুত পৌঁছে দিলে আমি সোজা ৳{offer} দেব!" },
      { en: "Here is ৳{offer} straight. Just don't let any car pass us.", bn: "এই নাও একদমে ৳{offer}। কোনো গাড়ি যেন আমাদের ওভারটেক না করে।" },
      { en: "I'll pay ৳{offer} cash right now. Time is everything today.", bn: "আমি এখনই নগদ ৳{offer} দিচ্ছি। আজকের দিনে সময়ের দামই সব।" },
      { en: "Take ৳{offer} and don't stop for unnecessary chatter.", bn: "৳{offer} টাকা নেন, ফালতু কথা না বলে দ্রুত বাইক ছোটান।" },
      { en: "Offering ৳{offer}. Double bonus if we arrive in 10 minutes.", bn: "৳{offer} অফার করছি। ১০ মিনিটে পৌঁছাতে পারলে ডাবল বোনাস।" },
      { en: "How about ৳{offer}? Twist the wrist and let the bike roar.", bn: "৳{offer} হলে কেমন হয়? পিক-আপে মোচড় দেন, বাইক গর্জন করুক।" },
      { en: "Here is ৳{offer} upfront. Take the flyover or the empty service lane.", bn: "অগ্রিম ৳{offer} নাও। ফ্লাইওভার বা ফাঁকা সার্ভিস লেন দিয়ে ছোটো।" },
      { en: "I can give ৳{offer}. Keep moving, no stalling at signals.", bn: "আমি ৳{offer} দিতে পারি। সিগন্যালে অযথা থেমে থাকবেন না।" },
      { en: "Offering ৳{offer}. You won't find a better paying customer today.", bn: "৳{offer} দিচ্ছি। আজকের দিনে এর চেয়ে বেশি ভাড়ার কাস্টমার পাবেন না।" },
      { en: "Take ৳{offer} and push the engine to its limit.", bn: "৳{offer} টাকা নেন আর ইঞ্জিনের পুরো শক্তি দিয়ে টানেন।" },
      { en: "I will do ৳{offer}. Big money for a fast and bold ride.", bn: "আমি ৳{offer} দেব। সাহসী আর দ্রুত রাইডের জন্য বড় অঙ্কের টাকা।" },
      { en: "Here's ৳{offer}. Drop me at the back alley, no questions asked.", bn: "এই নাও ৳{offer}। পেছনের গলিতে নামাবা, কোনো প্রশ্ন করবা না।" },
      { en: "I offer ৳{offer}. Let's dodge the main intersection check.", bn: "আমার অফার ৳{offer}। প্রধান মোড়ের পুলিশ চেকপোস্টটা এড়িয়ে চলো।" },
      { en: "Take ৳{offer} brother. Speed up and earn easy profit.", bn: "৳{offer} টাকা নেন ভাই। স্পিড বাড়ান আর সহজে ভালো লাভ করেন।" },
      { en: "I'm putting down ৳{offer}. Ready to twist and fly?", bn: "আমি ৳{offer} টাকা রাখছি। পিক-আপ ঘুরিয়ে ওড়ার জন্য তৈরি?" }
    ],
    counter: [
      { en: "৳{fare}? If you hit top speed, I'll raise it to ৳{counter}!", bn: "৳{fare}? সর্বোচ্চ স্পিডে টানলে আমি বাড়িয়ে ৳{counter} করে দেব!" },
      { en: "Make it ৳{counter}. Just get me there before the clock strikes.", bn: "৳{counter} ধরো। শুধু ঘড়ির কাঁটা পার হওয়ার আগে পৌঁছে দাও।" },
      { en: "I'll do ৳{counter}. But I don't want to see your brake lights too often.", bn: "আমি ৳{counter} দেব। তবে কথায় কথায় ব্রেক কষতে দেখতে চাই না।" },
      { en: "Take ৳{counter} and stop bargaining like an amateur.", bn: "৳{counter} নেন আর আনাড়ির মতো দরদাম বন্ধ করেন।" },
      { en: "Let's lock in ৳{counter}. You get rich, I save my deal.", bn: "৳{counter}-এ রফা করো। তোমার পকেট ভরবে, আমার কাজ হাসিল হবে।" },
      { en: "How about ৳{counter}? That's enough fuel money for two whole days!", bn: "৳{counter} হলে কেমন হয়? পুরো দুই দিনের তেলের খরচ উঠে যাবে এতে!" },
      { en: "Brother, ৳{counter} is king's money for this distance. Take it!", bn: "ভাই, এই দূরত্বের জন্য ৳{counter} তো রাজার মতো ভাড়া। নিয়ে নেন!" },
      { en: "I stretch to ৳{counter}. Just weave through the bumper traffic.", bn: "টেনে ৳{counter} করলাম। বাম্পার টু বাম্পার জ্যামের মধ্য দিয়ে চিরে বের হও।" },
      { en: "Make it ৳{counter} and don't hesitate at green lights.", bn: "৳{counter} ধরেন, সবুজ বাতি দেখলে আর কোনো দ্বিধা করবেন না।" },
      { en: "I will give ৳{counter}. Let's make this engine scream.", bn: "আমি ৳{counter} দেব। বাইকের ইঞ্জিনের আওয়াজ তুলে দেন।" },
      { en: "Take ৳{counter}, brother. Time wasted is money lost.", bn: "৳{counter} নেন ভাই। সময় নষ্ট মানেই তো টাকার অপচয়।" },
      { en: "Let's do ৳{counter}. Fast drop, instant cash in hand.", bn: "৳{counter}-এ চলেন। দ্রুত ড্রপ, সাথে সাথে হাতে গরম টাকা।" },
      { en: "How about ৳{counter}? Keep your eyes sharp and throttle open.", bn: "৳{counter} হলে কেমন হয়? চোখ কান খোলা রেখে থ্রটল খুলে টানেন।" },
      { en: "I offer ৳{counter}. Show me you have the guts for this city.", bn: "আমি ৳{counter} দিচ্ছি। প্রমাণ করেন এই শহরে চলার মতো কলিজা আছে।" },
      { en: "Fine, ৳{counter}. Now shut the mouth and twist the throttle!", bn: "ঠিক আছে, ৳{counter}। এবার কথা বন্ধ করে এক্সিলারেটরে মোচড় দাও!" }
    ],
    accept: [
      { en: "Deal! Helmet on, hold tight, and don't look back.", bn: "ডিল! হেলমেট মাথায় দাও, শক্ত করে ধরো, পেছনে তাকাবা না।" },
      { en: "Accepted! Let's vanish through the traffic grid.", bn: "রাজি! জ্যামের মধ্য দিয়ে গায়েব হয়ে যাই চলেন।" },
      { en: "That's what I'm talking about! Let's hit the road fast.", bn: "এই তো চাই! চলেন রাস্তায় গতি তুলি।" },
      { en: "Agreed. Step on the gas, brother!", bn: "সম্মত হলাম। একবারে গ্যাস বাড়িয়ে দেন ভাই!" },
      { en: "Deal done. Time to fly on two wheels.", bn: "চুক্তি পাক্কা। এবার দুই চাকার ওপর ওড়ার পালা।" },
      { en: "Accepted! Let's see how fast this machine can run.", bn: "কবুল! দেখি এই মেশিন কতটা জোরে ছুটতে পারে।" },
      { en: "You've got a deal. Don't slow down for anyone.", bn: "ডিল হয়ে গেল। কারও জন্য অযথা ধীরগতির হবেন না।" },
      { en: "Agreed. Take the elevated cut and bypass the police box.", bn: "রাজি। ফ্লাইওভারের ওপর দিয়ে নাও, পুলিশ বক্সটা পাশ কাটিয়ে যাই।" },
      { en: "Done. I like a rider with courage. Let's roll!", bn: "পাক্কা। সাহসী রাইডারই আমার পছন্দ। চলেন সামনে বাড়েন!" },
      { en: "Accepted! Let's beat every car on this road today.", bn: "মেনে নিলাম! আজকের রাস্তায় সব গাড়িকে পেছনে ফেলে দেব।" },
      { en: "Alright, deal accepted. Show me your best moves.", bn: "বেশ, ডিল কবুল। আপনার সেরা ড্রাইভিংটা দেখিয়ে দিন।" },
      { en: "Deal locked. Time is money, let's fly!", bn: "লক করা হলো। সময়ের অনেক দাম, উড়াল দিন!" },
      { en: "Agreed, brother. Keep the speed steady and high.", bn: "সম্মত হলাম ভাই। গতি বেশি আর স্থির রাখিয়েন।" },
      { en: "Accepted! The night streets belong to us.", bn: "রাজি! রাতের রাস্তা তো আমাদেরই দখলে।" },
      { en: "Deal made. Let's conquer Dhaka traffic right now.", bn: "কথা শেষ। ঢাকার ট্রাফিক জয় করার সময় এখন।" }
    ],
    reject: [
      { en: "You're too hesitant. I need someone fearless. Bye.", bn: "তোমার মধ্যে খুব ইতস্তত ভাব। আমার দরকার বেপরোয়া চালক। আসি।" },
      { en: "Too slow to negotiate, too slow to ride. Declining.", bn: "দরদামেও ঢিলেঢালা, চালাতেও হয়তো ঢিলেঢালা। বাতিল করলাম।" },
      { en: "No brother, if you're scared of high speed, this isn't for you.", bn: "না ভাই, স্পিডে টানতে ভয় পেলে এই ট্রিপ আপনার জন্য না।" },
      { en: "You talk too much about rules. I have urgent business.", bn: "আপনি নিয়মের কচকচানি বেশি করেন। আমার জরুরি কারবার আছে।" },
      { en: "Declining. I'll find a sports bike rider who won't hesitate.", bn: "না করলাম। স্পোর্টস বাইকার খুঁজব যে এত দ্বিধা করবে না।" },
      { en: "No deal. You're wasting precious minutes.", bn: "হলো না। আপনি মূল্যবান মিনিটগুলো নষ্ট করছেন।" },
      { en: "Not the rider I'm looking for. Safe travels grandpa.", bn: "আমার পছন্দের রাইডার আপনি নন। বুড়ো মানুষের মতো সাবধানে যান।" },
      { en: "Declining. I need to reach yesterday, not tomorrow.", bn: "বাতিল করলাম। আমার কালকের কাজ এখনই সারা দরকার।" },
      { en: "No brother, your bike doesn't have the pickup for this run.", bn: "না ভাই, আপনার বাইকের পিক-আপ দিয়ে এই ট্রিপ হবে না।" },
      { en: "I'll pass. Too much second-guessing.", bn: "আমি ছাড়লাম। অতিরিক্ত ভেবে সময় নষ্ট করার মানে হয় না।" },
      { en: "No deal. Finding a faster rider right now.", bn: "ডিল বাতিল। এখনই আরেকটু দ্রুত কাউকে খুঁজে নিচ্ছি।" },
      { en: "You're worried about risks? Then you can't earn big money.", bn: "ঝুঁকি নিয়ে এত চিন্তা? তাহলে তো বড় টাকা কামাতে পারবেন না।" },
      { en: "Declining. I don't ride behind nervous drivers.", bn: "না বললাম। নার্ভাস চালকের পেছনে আমি উঠি না।" },
      { en: "No thanks. I need someone who burns rubber.", bn: "ধন্যবাদ ভাই। টায়ারের ধোঁয়া উড়িয়ে টানতে পারে এমন চালক চাই।" },
      { en: "Deal off. Time's up, I'm taking another bike.", bn: "ডিল বাতিল। সময় শেষ, অন্য বাইকে উঠছি।" }
    ],
    small_talk: [
      { en: "Late-night Dhaka is a completely different city—wide open runways!", bn: "রাতের ঢাকা কিন্তু একদম আলাদা শহর—সোজা ফাঁকা রানওয়ে!" },
      { en: "Did you watch the underground drag race last Friday night?", bn: "গত শুক্রবার রাতের ড্র্যাগ রেসটা দেখেছিলে নাকি?" },
      { en: "If you know which alleys avoid the patrol checkpoints, you're the king.", bn: "কোন চিপাগলি দিয়ে টহল পুলিশ এড়ানো যায় জানলে তুমিই এই শহরের রাজা।" },
      { en: "That cricket match betting pool was worth lakhs of taka yesterday!", bn: "কালকে ক্রিকেটের বাজির পুলে লাখ লাখ টাকার খেলা হয়েছে!" },
      { en: "Braking hard in the rain is for rookies; real riders feather the clutch.", bn: "বৃষ্টিতে কষে ব্রেক কষা আনাড়িদের কাজ; আসল রাইডার ক্লাচ দিয়ে গতি ধরে।" },
      { en: "Everyone in this city wants something fast: fast money, fast food, fast ride.", bn: "এই শহরের সবাই দ্রুত কিছু চায়: দ্রুত টাকা, দ্রুত খাবার, দ্রুত রাইড।" },
      { en: "Look at that police siren ahead, turn into the narrow bypass!", bn: "সামনে পুলিশের সাইরেন দেখা যাচ্ছে, পাশের চিপা বাইপাসে মোড় নাও!" },
      { en: "My crew runs shipments across three districts every single midnight.", bn: "আমার ছেলেরা প্রতি মধ্যরাতে তিন জেলার ওপর দিয়ে মাল সাপ্লাই দেয়।" },
      { en: "No risk, no reward. That's the golden rule of surviving Dhaka.", bn: "ঝুঁকি নাই তো লাভ নাই। ঢাকায় টিকে থাকার একমাত্র খাঁটি নিয়ম এটাই।" },
      { en: "The adrenaline rush on a speeding bike beats any energy drink.", bn: "স্পিডে বাইক টানার যে রোমাঞ্চ, কোনো এনার্জি ড্রিংকসেও তার তুলনা নাই।" },
      { en: "People spend their whole lives playing safe and end up with nothing.", bn: "মানুষ সারা জীবন ভয়ে ভয়ে কাটিয়ে দেয়, শেষ পর্যন্ত কিছুই পায় না।" },
      { en: "Listen to that exhaust note rumble—pure music to my ears!", bn: "সাইলেন্সারের গর্জনটা শোনো—কানের জন্য একদম খাঁটি সুর!" },
      { en: "When you dodge a bumper by two inches, that's when you feel alive.", bn: "দুই ইঞ্চির ব্যবধানে যখন একটা বাম্পার কেটে বের হও, তখনই বেঁচে থাকার আসল মজা।" },
      { en: "Street smarts will take you further in Dhaka than any fancy university degree.", bn: "ঢাকার রাস্তায় টিকে থাকার বুদ্ধি কোনো বড় বিশ্ববিদ্যালয়ের ডিগ্রির চেয়েও বড়।" },
      { en: "Keep your nerve steady, brother. Fortune favours the bold!", bn: "বুকের সাহস ধরে রাখো ভাই। ভাগ্য সবসময় সাহসীদেরই পাশে দাঁড়ায়!" }
    ],
    drop_off: [
      { en: "Here is your ৳{fare} plus a fat tip. That was blazing fast!", bn: "এই নাও তোমার ৳{fare} সাথে মোটা বকশিশ। দারুণ আগুনে স্পিডে টানলা!" },
      { en: "Right at this quiet corner. Take the cash, don't ask about the bags.", bn: "এই নিরিবিলি কোণায় নামিয়ে দাও। টাকাটা নাও, ব্যাগের ব্যাপারে কোনো কথা নাই।" },
      { en: "You've got real guts on the road, brother. Keep the change!", bn: "রাস্তায় তোমার সত্যি কলিজা আছে ভাই। বাকি ভাংতিটা রেখে দাও!" },
      { en: "Arrived right on time for the handover. You saved my skin!", bn: "মাল হ্যান্ডওভারের ঠিক সময়ে পৌঁছালাম। আমার মান বাঁচিয়ে দিলা!" },
      { en: "Here is your money, champion. You ride like an eagle.", bn: "এই নাও তোমার টাকা চ্যাম্পিয়ন। ঈগল পাখির মতো উড়ে এসেছ।" },
      { en: "Take this extra ৳50. Buy yourself a hearty dinner tonight.", bn: "এই বাড়তি ৫০ টাকা রাখো। আজকে রাতে জমিয়ে ভালো কিছু খেয়ে নিও।" },
      { en: "Dropped me right on the mark without wasting a second. Respect!", bn: "এক সেকেন্ড নষ্ট না করে একদম নিশানায় নামিয়ে দিয়েছ। শ্রদ্ধা!" },
      { en: "Payment settled. If I need a fast getaway again, I'll call you.", bn: "পেমেন্ট দিলাম। পরে আবার দ্রুত কোথাও যেতে হলে তোমাকেই খুঁজব।" },
      { en: "Here is the cash. You cut through those trucks like a surgeon.", bn: "টাকাটা নাও। ট্রাকগুলোর মাঝখান দিয়ে সার্জনের মতো কেটে বের হলে।" },
      { en: "Big money for a fearless ride. Enjoy your earnings, brother!", bn: "সাহসী রাইডের জন্য বড় টাকা। আনন্দের সাথে খরচ করো ভাই!" },
      { en: "Arrived before anyone even noticed. Pure ghost on two wheels!", bn: "কেউ টের পাওয়ার আগেই পৌঁছে গেলাম। দুই চাকার সাক্ষাৎ ভূত তুমি!" },
      { en: "Here is ৳{fare}. Next time, let's go even faster!", bn: "এই নাও ৳{fare} টাকা। পরের বার আরও দ্রুত টানতে হবে!" },
      { en: "Take the money and vanish before the patrol turns this way.", bn: "টাকাটা নিয়ে হাওয়া হয়ে যাও, টহল গাড়ি এদিকে ঘোরার আগেই।" },
      { en: "You delivered on your promise. Top tier riding, brother.", bn: "কথার দাম রেখেছ। এক নম্বরের রাইডার তুমি ভাই।" },
      { en: "Fare paid with bonus. Keep that engine screaming across Dhaka!", bn: "বোনাসসহ ভাড়া পরিশোধ। সারা ঢাকায় ইঞ্জিনের এই আওয়াজ ধরে রেখো!" }
    ]
  }
};

// Character-specific flag-conditioned lines
const characterLines = [
  // Tanvir
  {
    id: 'char_tanvir_flag_punctual',
    characterId: 'char_tanvir',
    archetype: 'commuter',
    phase: 'small_talk',
    key: 'dialogue.char.tanvir.punctual',
    category: 'general',
    requires: { flags: { helpedTanvirEarly: true } },
    en: "My boss actually commended me on punctuality after that swift ride you gave me!",
    bn: "সেদিন আপনি এত দ্রুত পৌঁছে দিয়েছিলেন যে আমার বস সময়মতো আসার জন্য প্রশংসা করলেন!"
  },
  {
    id: 'char_tanvir_flag_rush_meeting',
    characterId: 'char_tanvir',
    archetype: 'commuter',
    phase: 'greeting',
    key: 'dialogue.char.tanvir.rush_meeting',
    category: 'general',
    requires: { minRelationship: 20 },
    en: "Rafi! Always a relief when I see your bike when my schedule is on fire.",
    bn: "রাফি! যখন শিডিউল নিয়ে আগুন লেগে যায় তখন তোমার বাইক দেখলে সত্যি স্বস্তি লাগে।"
  },
  {
    id: 'char_tanvir_flag_bonus',
    characterId: 'char_tanvir',
    archetype: 'commuter',
    phase: 'drop_off',
    key: 'dialogue.char.tanvir.bonus',
    category: 'general',
    requires: { flags: { gaveCorporateDiscount: true } },
    en: "Here's the bonus I promised. Corporate riders never forget those who help in a crunch.",
    bn: "কথা দেওয়া বোনাসটা নাও। বিপদের সময় যারা সাহায্য করে কর্পোরেট যাত্রীরা তাদের কখনো ভোলে না।"
  },

  // Mintu
  {
    id: 'char_mintu_flag_tea_discount',
    characterId: 'char_mintu',
    archetype: 'regular',
    phase: 'greeting',
    key: 'dialogue.char.mintu.tea_discount',
    category: 'family',
    requires: { flags: { mintuTeaDiscount: true } },
    en: "Rafi dost! Come by the stall tonight, hot malai cha is on the house for you.",
    bn: "রাফি দোস্ত! আজকে রাতে টঙে আসিস, তোর জন্য স্পেশাল গরম মালাই চা ফ্রি।"
  },
  {
    id: 'char_mintu_flag_bike_sound',
    characterId: 'char_mintu',
    archetype: 'regular',
    phase: 'small_talk',
    key: 'dialogue.char.mintu.bike_sound',
    category: 'general',
    requires: { minRelationship: 30 },
    en: "Your bike's engine sounds much healthier today. Kamal bhai did a solid tuning job!",
    bn: "তোর বাইকের ইঞ্জিনের আওয়াজ আজকে বেশ পরিষ্কার শোনায়। কামাল ভাই ভালো টিউন করেছেন!"
  },
  {
    id: 'char_mintu_flag_drop',
    characterId: 'char_mintu',
    archetype: 'regular',
    phase: 'drop_off',
    key: 'dialogue.char.mintu.drop',
    category: 'humour',
    requires: { minRelationship: 15 },
    en: "Keep the fare, or rather, I'll deduct it from your monthly tea tab at the stall, haha!",
    bn: "ভাড়াটা রাখ, অথবা বরং তোর মাসিক চায়ের খাতা থেকেই এটা কেটে দেব, হাহাহা!"
  },

  // Rahim Chacha
  {
    id: 'char_rahim_flag_shortcut',
    characterId: 'char_rahim',
    archetype: 'regular',
    phase: 'small_talk',
    key: 'dialogue.char.rahim.shortcut',
    category: 'jam',
    requires: { flags: { tookRahimShortcut: true } },
    en: "See? The elders know cuts through Puran Dhaka that your satellite maps never dreamed of!",
    bn: "দেখলে তো? মুরুব্বিরা পুরান ঢাকার এমন সব চিপাগলি চেনে যা তোমার স্যাটেলাইট ম্যাপ কখনো স্বপ্নেও দেখেনি!"
  },
  {
    id: 'char_rahim_flag_respect',
    characterId: 'char_rahim',
    archetype: 'regular',
    phase: 'greeting',
    key: 'dialogue.char.rahim.respect',
    category: 'family',
    requires: { minRelationship: 25 },
    en: "Bite-sized Rafi! You drive with the patience of an old soul. Take this uncle to the mosque.",
    bn: "আমাদের রাফি বাবাজী! তুমি বয়স্ক মানুষের মতো ধৈর্য নিয়ে চালাও। এই চাচাকে একটু মসজিদে নামিয়ে দাও।"
  },
  {
    id: 'char_rahim_flag_blessing',
    characterId: 'char_rahim',
    archetype: 'regular',
    phase: 'drop_off',
    key: 'dialogue.char.rahim.blessing',
    category: 'family',
    requires: { minRelationship: 20 },
    en: "May Allah fill your journey with safety and barakah. Take these sweets for your mother.",
    bn: "আল্লাহ তোমার পথচলা নিরাপদ আর বরকতময় করুন। তোমার মায়ের জন্য এই মিষ্টিটুকু নিয়ে যেও।"
  },

  // Mrs. Ferdousi
  {
    id: 'char_ferdousi_flag_safe_child',
    characterId: 'char_ferdousi',
    archetype: 'careful',
    phase: 'small_talk',
    key: 'dialogue.char.ferdousi.safe_child',
    category: 'family',
    requires: { flags: { droveCarefullyChild: true } },
    en: "My little boy wasn't scared at all on your bike. You drove like a true caring elder brother.",
    bn: "তোমার বাইকে আমার ছেলেটা একদম ভয় পায়নি। সত্যি একজন স্নেহশীল বড় ভাইয়ের মতো চালিয়েছ।"
  },
  {
    id: 'char_ferdousi_flag_school_run',
    characterId: 'char_ferdousi',
    archetype: 'careful',
    phase: 'greeting',
    key: 'dialogue.char.ferdousi.school_run',
    category: 'exams',
    requires: { minRelationship: 20 },
    en: "Rafi brother, school exam starts soon. I trust only you to take us there without panic.",
    bn: "রাফি ভাই, স্কুলের পরীক্ষা শুরু হবে। কোনো ভয়-ভীতি ছাড়া পৌঁছানোর জন্য আমি শুধু তোমাকেই ভরসা করি।"
  },
  {
    id: 'char_ferdousi_flag_gratitude',
    characterId: 'char_ferdousi',
    archetype: 'careful',
    phase: 'drop_off',
    key: 'dialogue.char.ferdousi.gratitude',
    category: 'family',
    requires: { minRelationship: 25 },
    en: "A mother's prayers will always accompany your motorcycle, brother. Take care.",
    bn: "একজন মায়ের অন্তরের দোয়া সবসময় তোমার বাইকের সাথে থাকবে ভাই। সাবধানে থেকো।"
  },

  // Kamal Bhai
  {
    id: 'char_kamal_flag_mechanic_review',
    characterId: 'char_kamal',
    archetype: 'regular',
    phase: 'small_talk',
    key: 'dialogue.char.kamal.mechanic_review',
    category: 'general',
    requires: { flags: { boughtBike: true } },
    en: "That upgraded motorcycle suits your riding style nicely. Keep the engine oil fresh every 1000 km!",
    bn: "নতুন বাইকটা তোমার রাইডিং স্টাইলের সাথে দারুণ মানিয়েছে। প্রতি ১০০০ কিমিতে ইঞ্জিন অয়েল বদলাতে ভুলো না!"
  },
  {
    id: 'char_kamal_flag_garage_call',
    characterId: 'char_kamal',
    archetype: 'regular',
    phase: 'greeting',
    key: 'dialogue.char.kamal.garage_call',
    category: 'general',
    requires: { minRelationship: 30 },
    en: "Rafi! Hop over to the spare parts depot with me, I have heavy brake shoes to fetch.",
    bn: "রাফি! আমার সাথে স্পেয়ার পার্টসের দোকানে একটু চলো, ভারী কিছু ব্রেক শু আনতে হবে।"
  },
  {
    id: 'char_kamal_flag_discount_hint',
    characterId: 'char_kamal',
    archetype: 'regular',
    phase: 'drop_off',
    key: 'dialogue.char.kamal.discount_hint',
    category: 'general',
    requires: { minRelationship: 25 },
    en: "Whenever your bike feels loose, bring it straight to my bay. Family rates always apply.",
    bn: "বাইকে কোনো গোলমাল মনে হলেই সোজা আমার গ্যারেজে নিয়ে আসবে। ঘরের মানুষের রেটেই কাজ হবে।"
  },

  // Nabila
  {
    id: 'char_nabila_flag_exam_passed',
    characterId: 'char_nabila',
    archetype: 'bargainer',
    phase: 'small_talk',
    key: 'dialogue.char.nabila.exam_passed',
    category: 'exams',
    requires: { flags: { studentDiscountGiven: true } },
    en: "I aced that semester final! Thanks for giving students a break on fares back then.",
    bn: "সেমিস্টার ফাইনালে আমি দারুণ রেজাল্ট করেছি! সেদিন ছাত্র হিসেবে ভাড়ায় ছাড় দেওয়ার জন্য ধন্যবাদ ভাই।"
  },
  {
    id: 'char_nabila_flag_campus',
    characterId: 'char_nabila',
    archetype: 'bargainer',
    phase: 'greeting',
    key: 'dialogue.char.nabila.campus',
    category: 'exams',
    requires: { minRelationship: 20 },
    en: "Rafi bhai! Going to the university library. Settle a decent student rate today?",
    bn: "রাফি ভাই! ভার্সিটির লাইব্রেরির দিকে যাব। আজকে একটা ভালো স্টুডেন্ট রেট ঠিক করা যায়?"
  },

  // Jamil
  {
    id: 'char_jamil_flag_silent',
    characterId: 'char_jamil',
    archetype: 'risky',
    phase: 'small_talk',
    key: 'dialogue.char.jamil.silent',
    category: 'general',
    requires: { flags: { refusedShadyParcel: true } },
    en: "You have rigid principles on these streets, rider. Some admire it, others find it troublesome.",
    bn: "এই রাস্তায় তোমার বড় কড়া নীতি দেখছি ভাই। কেউ হয়তো এর প্রশংসা করবে, আবার কারও কাছে এটা ঝামেলার।"
  },
  {
    id: 'char_jamil_flag_cooperation',
    characterId: 'char_jamil',
    archetype: 'risky',
    phase: 'greeting',
    key: 'dialogue.char.jamil.cooperation',
    category: 'general',
    requires: { flags: { joinedScheme: true } },
    en: "Well well, our reliable partner! The night is lucrative when everyone understands their role.",
    bn: "আরে আরে, আমাদের নির্ভরযোগ্য পার্টনার! সবাই নিজের কাজ বুঝলে রাতের উপার্জনে কোনো খামতি থাকে না।"
  },

  // SI Morshed
  {
    id: 'char_morshed_flag_helmet_praise',
    characterId: 'char_morshed',
    archetype: 'commuter',
    phase: 'small_talk',
    key: 'dialogue.char.morshed.helmet_praise',
    category: 'general',
    requires: { flags: { helpedPoliceCheck: true } },
    en: "If all riders in Dhaka strapped on certified helmets like you do, our trauma wards would be half empty.",
    bn: "ঢাকার সব বাইকার যদি তোমার মতো নিয়ম মেনে ভালো হেলমেট পরত, তবে ট্রমা সেন্টারের অর্ধেক বেড খালি থাকত।"
  },
  {
    id: 'char_morshed_flag_duty',
    characterId: 'char_morshed',
    archetype: 'commuter',
    phase: 'greeting',
    key: 'dialogue.char.morshed.duty',
    category: 'general',
    requires: { minRelationship: 15 },
    en: "Rafi, quick drop to the traffic control room. Law abiding citizens always get my respect.",
    bn: "রাফি, ট্রাফিক কন্ট্রোল রুমে চট করে নামিয়ে দাও তো। আইন মানা নাগরিককে আমি সবসময় সম্মান করি।"
  },

  // Bablu
  {
    id: 'char_bablu_flag_heavy_haul',
    characterId: 'char_bablu',
    archetype: 'regular',
    phase: 'small_talk',
    key: 'dialogue.char.bablu.heavy_haul',
    category: 'general',
    requires: { flags: { hauledHeavyGoods: true } },
    en: "That luggage carrier upgrade turned your bike into a true market workhorse, brother!",
    bn: "পেছনের ক্যারিয়ার লাগানোর পর তোমার বাইকটা বাজারের একদম খাঁটি মালবাহী ঘোড়া হয়ে গেছে ভাই!"
  },
  {
    id: 'char_bablu_flag_market_rush',
    characterId: 'char_bablu',
    archetype: 'regular',
    phase: 'greeting',
    key: 'dialogue.char.bablu.market_rush',
    category: 'general',
    requires: { minRelationship: 20 },
    en: "Rafi mama! Fresh vegetable crates just arrived from Savar. Help me haul a quick bundle!",
    bn: "রাফি মামা! সাভার থেকে তাজা সবজির খাঁচা নামল। চট করে এক বান্ডিল মাল নিয়ে যেতে সাহায্য করো!"
  }
];

// Generate structured data
const allLines = [];
const enDict = {};
const bnDict = {};

// 1. Process archetype lines
for (const arch of archetypes) {
  for (const ph of phases) {
    const pool = templates[arch]?.[ph] || [];
    if (pool.length < 15) {
      console.error(`Error: Archetype ${arch} phase ${ph} only has ${pool.length} lines, need >= 15!`);
      process.exit(1);
    }
    pool.forEach((item, idx) => {
      const id = `dl_${arch}_${ph}_${String(idx + 1).padStart(2, '0')}`;
      const key = `dialogue.pool.${arch}.${ph}.${String(idx + 1).padStart(2, '0')}`;
      
      allLines.push({
        id,
        archetype: arch,
        phase: ph,
        key,
        category: ph === 'small_talk' ? (['cricket', 'exams', 'jam', 'rain', 'family', 'humour'][idx % 6]) : 'general'
      });

      enDict[key] = item.en;
      bnDict[key] = item.bn;
    });
  }
}

// 2. Process character flag-conditioned lines
for (const cl of characterLines) {
  allLines.push({
    id: cl.id,
    characterId: cl.characterId,
    archetype: cl.archetype,
    phase: cl.phase,
    key: cl.key,
    category: cl.category,
    requires: cl.requires
  });

  enDict[cl.key] = cl.en;
  bnDict[cl.key] = cl.bn;
}

console.log(`Generated total of ${allLines.length} dialogue entries:`);
console.log(`- Per-archetype base lines: ${archetypes.length * phases.length * 15} (35 pools x 15)`);
console.log(`- Flag-conditioned character lines: ${characterLines.length}`);

// Output files
const dialogueLinesPath = path.resolve('data/dialogue_lines.json');
fs.writeFileSync(dialogueLinesPath, JSON.stringify(allLines, null, 2), 'utf-8');
console.log(`Wrote ${dialogueLinesPath}`);

const enDialoguePath = path.resolve('data/dialogue/en/dialogue.json');
fs.writeFileSync(enDialoguePath, JSON.stringify(enDict, null, 2), 'utf-8');
console.log(`Wrote ${enDialoguePath}`);

const bnDialoguePath = path.resolve('data/dialogue/bn/dialogue.json');
fs.writeFileSync(bnDialoguePath, JSON.stringify(bnDict, null, 2), 'utf-8');
console.log(`Wrote ${bnDialoguePath}`);

console.log('Dialogue generation completed successfully!');
