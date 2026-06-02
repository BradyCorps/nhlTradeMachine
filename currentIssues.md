Component	Issue
Tug Bar 	does not move left or right depending on value. Stays central. Is this by design?
Home Net Gain	 is above Team Strands but might make more sense to have it beneath the team strands or some other solution so that it is well visible
Your Franchise/Trade Partner Present and future rating Feature looks great	
Team Strands 	needs a rework to resemble how player strands looks. Right now there is significant overlap and playoff threashold doesn’t show
Questions about QOC,	 it seems all teams have a low QOC. Even a stacked team like Colorado has a low team QOC, Low team OFF and Low team DEF. need to make sure this is calculating correctly and add league average reference
What this team needs 	looks good but maybe give examples of players that the team should be looking for
Should we add a trade block, 	something that shows what teams are willing to give up based on their status and extra players
I think we need a position chart (how many C's does a team have for example)	
Retained Salary 	does not persist once traded. (ex retaining 50% of 4 million will show accruately, but when the trade happens, the original salary is populated back in the new team)
Player STRAND	shows age when that really isnt a relevant deep analytical point like NOIV and the other things we have on there
Select Trade Partner	When Selecting a trade partner, should be able to see their status (ie retoolings, bubble, etc.)
Who wants this package	needs some work on it, it also does not go away after changing the package and persists forever.
Compression might still be too severe	
Projected Season Results 	should read Season Results and include the playoff tree 
 Claude AI 	start the sim in the new year and have something that reads "think youre better than your GM, take your current roster and go back to the start of the 25/26 season and try and make changes to put you in the best position possible" or something liket that
Find Trade Partners for this package	Should only show packages that are approved by the other team by default
Oliver Bonk issue	1GP 1G 1A 2P when trading for him Claude AI sees him as a 164 point player. EX. Oliver Bonk wasn't just a throw-in for playoff depth—he became a franchise cornerstone overnight. The 21-year-old defenseman acquired from Philadelphia for Nick Blankenburg and a second-rounder exploded for 164 points in 82 games 
Season Sim and Claude AI different	Using the Bonk example above, the AI claims 164 points, but the Points leader for the year is MacKinnon at 116pts. I am thinking our SIM engine needs to run a full year and the Claude bases its AI summary on that.
Claude AI	states in the year in numbers that MacKinnion has "48 (estimated from 116pts)" we should not have that estimated, he either got the goals or didn’t
Claude AI	In most cases, the GAA and S% leader is Scott Wedgewood based on his campaign with Colorado, but the Vezina finalists this year are: Sorokin, Swayman and Vasilevskiy. Wedgewood plays on a really good team, but that team just got swept in the conference finals by the golden knights, so I think we need to rework that
Claude AI	I think if we do the sim at the start of 25/26 we can eliminate the Schaefer always win the Calder rule
evaluate/route.ts	1971L — runGmLogic is 858 lines with zero test coverage, highest risk in the repo. Needs to be addressed
STATIC_ROSTER in league/route.ts	382 entries last updated mid-2024, every team except WPG is potentially stale. The /current NHL API endpoint overrides it in production but any API failure falls back to bad data. We need to create a backup of the NHL API somehow that gets replaced whenever it runs, or some solution like that
contracts.bundled.json	201 entries, no clear ownership of when it gets refreshed. Leo Carlsson missing, others likely wrong. Should probably develop some sort of website manger console that lets me adjust things on a UI level
Mobile: 	trade page is essentially desktop-only. Although functional, we can do better
<img width="557" height="1641" alt="image" src="https://github.com/user-attachments/assets/34da7daa-2673-4e33-928c-2c7c76aa3a1c" />
