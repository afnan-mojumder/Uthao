// T8.6 dialogue for the six new archetypes. Merged into generate-dialogue.mjs's templates.
// Each archetype has 15 lines: 3 greetings, 2 for every other phase. Placeholders: {fare}, {offer}, {destination}.

const L = (en, bn) => ({ en, bn });

export const t86Templates = {
  student: {
    greeting: [
      L("Bhai, I'm a student with a tight budget. Can you take me to {destination}?", "ভাই, আমি একজন ছাত্র, হাতে টাকা কম। {destination} নিয়ে যাবেন?"),
      L("Brother, I have my exam pass in hand and need to reach {destination} fast.", "ভাই, পরীক্ষার প্রবেশপত্র হাতে, তাড়াতাড়ি {destination} পৌঁছাতে হবে।"),
      L("Hey rider, any chance you can take a student to {destination}?", "এই রাইডার ভাই, একজন ছাত্রকে {destination} পর্যন্ত নিতে পারবেন?"),
    ],
    offer: [
      L("Can I pay ৳{offer}? That's all my pocket money this week.", "৳{offer} দিতে পারি? এই সপ্তাহের হাতখরচ তো এটুকুই।"),
      L("Brother, ৳{offer} is what I have left after the tuition fee.", "ভাই, টিউশন ফি দেওয়ার পর আমার কাছে ৳{offer} আছে।"),
    ],
    counter: [
      L("Please, ৳{offer} and I'll buy you tea after class.", "প্লিজ ভাই, ৳{offer} দেন, ক্লাস শেষে চা খাওয়াব।"),
      L("Could we meet in the middle at ৳{offer}?", "৳{offer}-এ মাঝামাঝি একটা রফা হয় না?"),
    ],
    accept: [
      L("Thanks brother, ৳{offer} works. Let's go.", "ধন্যবাদ ভাই, ৳{offer} ঠিক আছে। চলেন।"),
      L("Okay, that's fair. My exam starts soon.", "আচ্ছা, এটা ন্যায্য। পরীক্ষা তো শুরু হয়ে যাচ্ছে।"),
    ],
    reject: [
      L("Sorry brother, that's too much for a student.", "দুঃখিত ভাই, ছাত্রের জন্য এটা অনেক বেশি।"),
      L("I'll wait for the next rider, I can't afford that.", "পরের রাইডারের জন্য অপেক্ষা করি, এত দাম দিতে পারব না।"),
    ],
    small_talk: [
      L("Did you see the cricket match last night?", "কাল রাতের ক্রিকেট ম্যাচটা দেখেছেন?"),
      L("Exams are killing me this month, brother.", "এই মাসে পরীক্ষা তো জান শেষ করে দিচ্ছে ভাই।"),
    ],
    drop_off: [
      L("Thanks brother, rate me well, I'm trying to save.", "ধন্যবাদ ভাই, ভালো রেটিং দিয়েন, টাকা জমানোর চেষ্টা করছি।"),
      L("Take care on the road, and good luck with your work.", "রাস্তায় সাবধানে যাবেন, কাজে সফল হোন।"),
    ],
  },
  office: {
    greeting: [
      L("Rider, I'm late for the office. {destination}, quick as you can?", "রাইডার ভাই, অফিসে দেরি হয়ে যাচ্ছে। {destination}, যত দ্রুত পারেন?"),
      L("Brother, boss will kill me if I miss the nine o'clock meeting.", "ভাই, নয়টার মিটিং মিস করলে বস তো আমাকে শেষ করে দেবে।"),
      L("Please take me to {destination}, I'm already running behind.", "প্লিজ ভাই, {destination} নিয়ে চলেন, আগেই দেরি হয়ে গেছে।"),
    ],
    offer: [
      L("I'll pay ৳{offer}, no bargaining, I just need to get there.", "৳{offer} দেব, দরদাম নাই, শুধু পৌঁছাতে হবে।"),
      L("The usual fare is ৳{offer}, right? Let's go.", "সাধারণত ৳{offer} লাগে, তাই না? চলেন।"),
    ],
    counter: [
      L("Make it ৳{offer} and I'll tip you on arrival.", "৳{offer} করেন, পৌঁছে বকশিশ দেব।"),
      L("Honestly ৳{offer} is fine, I just don't want the jam.", "সত্যি বলছি ৳{offer} হলেই হবে, জ্যাম যেন না লাগে।"),
    ],
    accept: [
      L("Good, ৳{offer} it is. Go, go!", "ভালো, ৳{offer} ঠিক। চলেন চলেন!"),
      L("Fine, we're agreed. Please hurry.", "ঠিক আছে, রাজি। একটু তাড়াতাড়ি করেন।"),
    ],
    reject: [
      L("That's too much for a quick ride, I'll get a CNG.", "এত দামে তো হবে না, সিএনজি ধরি।"),
      L("No, that fare is ridiculous. Find someone else.", "না, এই ভাড়া অযৌক্তিক। অন্য কাউকে দেখেন।"),
    ],
    small_talk: [
      L("Traffic is worse this week, isn't it?", "এই সপ্তাহে জ্যাম আরও বেশি, তাই না?"),
      L("Every day I say I'll leave earlier. Never happens.", "রোজ ভাবি আগে বের হব, হয় না কখনও।"),
    ],
    drop_off: [
      L("Thanks, you saved my job today.", "ধন্যবাদ, আজ তো আপনি আমার চাকরিটা বাঁচালেন।"),
      L("Keep the change, and rate me five stars please.", "খুচরা রাখেন, আর পাঁচ তারা রেটিং দিয়েন।"),
    ],
  },
  urgent: {
    greeting: [
      L("Brother, emergency! Take me to {destination} right now!", "ভাই, জরুরি! এখনই {destination} নিয়ে চলেন!"),
      L("Please, someone is sick at {destination}. Ride fast.", "প্লিজ ভাই, {destination}-এ একজন অসুস্থ। দ্রুত চালান।"),
      L("No time to talk, just go to {destination}, I'll pay anything reasonable.", "কথা বলার সময় নাই, {destination} চলেন, যুক্তিসঙ্গত যা লাগে দেব।"),
    ],
    offer: [
      L("I'll give ৳{offer}, please just go.", "৳{offer} দেব, প্লিজ এখনই চলেন।"),
      L("Take ৳{offer}, I have it ready. Move!", "৳{offer} নেন, তৈরি আছে। চলেন!"),
    ],
    counter: [
      L("Just take ৳{offer}, I'm begging you.", "শুধু ৳{offer} নেন, অনুরোধ করছি।"),
      L("৳{offer}. I'll sort the rest later, I promise.", "৳{offer}। বাকিটা পরে ঠিক করব, কথা দিলাম।"),
    ],
    accept: [
      L("Okay, okay, ৳{offer}. Let's move now.", "আচ্ছা আচ্ছা, ৳{offer}। এখন চলেন।"),
      L("Thank you, thank you. Go!", "ধন্যবাদ, ধন্যবাদ। চলেন!"),
    ],
    reject: [
      L("I don't have time to argue. Find another ride.", "তর্ক করার সময় নাই। অন্য রাইড খোঁজেন।"),
      L("You're charging an emergency price. Forget it.", "এটা তো জরুরি দরে চাইছেন। থাক।"),
    ],
    small_talk: [
      L("I'm so sorry for the rush, brother.", "তাড়াহুড়ার জন্য দুঃখিত ভাই।"),
      L("Hospitals are always far away from home, aren't they?", "হাসপাতাল তো সবসময় বাসা থেকে দূরেই হয়, না?"),
    ],
    drop_off: [
      L("Thank you so much, I'll never forget this.", "অনেক ধন্যবাদ ভাই, এটা কখনও ভুলব না।"),
      L("God bless you, drive safe back.", "আল্লাহ ভালো রাখুন, ফেরার পথে সাবধানে যাবেন।"),
    ],
  },
  traveler: {
    greeting: [
      L("Excuse me, I'm new here. Can you take me toward {destination}?", "মাফ করবেন, আমি এখানে নতুন। {destination}-এর দিকে নিয়ে যাবেন?"),
      L("I'm lost, brother. Is {destination} near the big mosque side?", "ভাই, পথ হারিয়ে ফেলেছি। {destination} কি বড় মসজিদের দিকে?"),
      L("First time in this area. Could you show me the way to {destination}?", "এই এলাকায় প্রথমবার। {destination}-এর পথটা একটু দেখিয়ে দেবেন?"),
    ],
    offer: [
      L("I'll pay ৳{offer}, I don't know the fare here yet.", "৳{offer} দেব, এখানকার ভাড়া এখনও জানি না।"),
      L("Is ৳{offer} the normal price for this distance?", "এই দূরত্বে ৳{offer} কি স্বাভাবিক দাম?"),
    ],
    counter: [
      L("Could you do ৳{offer}? I don't want to be cheated.", "৳{offer} করা যায়? আমাকে ঠকাতে চাই না।"),
      L("৳{offer} sounds right to me. Okay?", "৳{offer}-ই ঠিক মনে হচ্ছে। রাজি?"),
    ],
    accept: [
      L("Good, ৳{offer} works. Thank you for helping.", "ভালো, ৳{offer} ঠিক আছে। সাহায্যের জন্য ধন্যবাদ।"),
      L("Alright, let's go. Tell me the landmarks on the way.", "আচ্ছা চলেন। রাস্তায় ল্যান্ডমার্কগুলো বলবেন।"),
    ],
    reject: [
      L("That's too high for a stranger. I'll ask someone else.", "অপরিচিত মানুষের জন্য এটা অনেক বেশি। অন্য কাউকে জিজ্ঞেস করি।"),
      L("No, I think that's overcharging me.", "না, মনে হচ্ছে এটা আমার থেকে বেশি নিচ্ছেন।"),
    ],
    small_talk: [
      L("This city is so busy, I can't believe the crowds.", "শহরটা এত ব্যস্ত, ভিড় দেখে অবাক লাগছে।"),
      L("Is the river view nice from the bridge?", "সেতু থেকে নদীর দৃশ্য কেমন?"),
    ],
    drop_off: [
      L("Thanks for the ride, you've been very kind.", "রাইডের জন্য ধন্যবাদ, আপনি অনেক ভালো।"),
      L("Please give me five stars, I'll tell my friends about you.", "পাঁচ তারা দিয়েন, বন্ধুদের কাছে আপনার কথা বলব।"),
    ],
  },
  unreliable: {
    greeting: [
      L("Brother, I'm going to {destination}. Maybe. Can you wait a bit?", "ভাই, {destination} যাব। হয়তো। একটু অপেক্ষা করতে পারবেন?"),
      L("I think I'm going to {destination}. Let's see how it goes.", "মনে হয় {destination} যাব। দেখা যাক কী হয়।"),
      L("Ride to {destination}? I might be late, is that okay?", "{destination} রাইড? আমি দেরি করতে পারি, ঠিক আছে?"),
    ],
    offer: [
      L("I'll pay ৳{offer}, I'll pay you later from my bank.", "৳{offer} দেব, পরে ব্যাংক থেকে দিয়ে দেব।"),
      L("৳{offer}, okay? I'll sort the rest when we arrive.", "৳{offer}, ঠিক আছে? বাকিটা পৌঁছে দেখব।"),
    ],
    counter: [
      L("Let's say ৳{offer} and forget about it.", "৳{offer} ধরেন, আর কিছু ভাবার দরকার নাই।"),
      L("Maybe ৳{offer}, I'll think about it.", "হয়তো ৳{offer}, ভেবে দেখি।"),
    ],
    accept: [
      L("Yes, ৳{offer}. Let's go before I change my mind.", "হ্যাঁ, ৳{offer}। মন বদলানোর আগে চলেন।"),
      L("Fine, ৳{offer}. Hopefully this works out.", "ঠিক আছে, ৳{offer}। আশা করি ঠিক থাকবে।"),
    ],
    reject: [
      L("Actually, I changed my mind. Forget the ride.", "আসলে মন বদলে গেছে। রাইড বাদ দেন।"),
      L("That's not what I wanted to pay, cancel it.", "এত দাম দিতে চাইনি, বাতিল করেন।"),
    ],
    small_talk: [
      L("My phone keeps dying, sorry about that.", "ফোন বারবার বন্ধ হয়ে যাচ্ছে, দুঃখিত।"),
      L("Everyone promises rides and then doesn't show, right?", "সবাই রাইডের কথা দিয়ে পরে আসে না, তাই না?"),
    ],
    drop_off: [
      L("Yeah, we're here. Sorry about the mess earlier.", "এই তো পৌঁছে গেছি। আগের ঝামেলার জন্য দুঃখিত।"),
      L("Let me see the fare first, I'll pay later maybe.", "আগে ভাড়াটা দেখি, পরে হয়তো দেব।"),
    ],
  },
  family: {
    greeting: [
      L("Brother, we are a family of four, going to {destination}. Can you manage?", "ভাই, আমরা চারজন, {destination} যাব। পারবেন?"),
      L("Please, my mother needs to reach {destination}. Take it slow and steady.", "প্লিজ ভাই, মায়ের {destination} পৌঁছানো দরকার। ধীরে ও নিরাপদে চালাবেন।"),
      L("We have a child and some luggage, going to {destination}. Is that okay?", "আমাদের সঙ্গে একটা বাচ্চা আর কিছু মালপত্র, {destination} যাব। চলবে?"),
    ],
    offer: [
      L("We can pay ৳{offer}, that's our limit for the trip.", "৳{offer} দিতে পারব, যাতায়াতের সীমা এটাই।"),
      L("৳{offer} is fair for a careful ride with luggage, I think.", "মালপত্রসহ সাবধানে যাওয়ার জন্য ৳{offer} ন্যায্য মনে হয়।"),
    ],
    counter: [
      L("Could you do ৳{offer}? We'll tip for the safe ride.", "৳{offer} করা যায়? নিরাপদ রাইডের জন্য বকশিশ দেব।"),
      L("৳{offer} and please don't rush with the kid.", "৳{offer}, আর বাচ্চা থাকায় একটু ধীরে চালাবেন।"),
    ],
    accept: [
      L("Thank you, ৳{offer} is good. Please be careful.", "ধন্যবাদ, ৳{offer} ঠিক আছে। সাবধানে চালাবেন।"),
      L("Alright, ৳{offer}. We'll get in slowly.", "আচ্ছা, ৳{offer}। আমরা ধীরে ধীরে উঠছি।"),
    ],
    reject: [
      L("That's not safe with luggage and a child. We'll wait.", "মালপত্র আর বাচ্চা নিয়ে এটা নিরাপদ না। আমরা অপেক্ষা করি।"),
      L("Too expensive for us, sorry brother.", "আমাদের জন্য এটা অনেক বেশি, দুঃখিত ভাই।"),
    ],
    small_talk: [
      L("The kids are so noisy in the morning, brother.", "সকালে বাচ্চারা অনেক হইচই করে, ভাই।"),
      L("My mother used to ride like this in her youth, you know.", "আমার মা-ও তো যৌবনে এভাবে যেতেন।"),
    ],
    drop_off: [
      L("Thank you for the careful ride, everyone is safe.", "নিরাপদ রাইডের জন্য ধন্যবাদ, সবাই ভালো আছে।"),
      L("Please rate us well, we're grateful to you.", "ভালো রেটিং দিয়েন, আপনার কাছে কৃতজ্ঞ।"),
    ],
  },
};
