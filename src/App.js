import React, { Component } from 'react';
import './App.css';
import 'react-notifications/lib/notifications.css';
import * as mm from "@magenta/music";
import { saveAs } from 'file-saver';
import playLogo from './playlogo.png'
import downloadLogo from './downloadlogo.png'
import stopLogo from './stoplogo.png'
import {NotificationContainer, NotificationManager} from 'react-notifications';

const mvae = new mm.MusicVAE("https://storage.googleapis.com/magentadata/js/checkpoints/music_vae/trio_4bar");
const numbers = [0, 1, 2, 3, 4, 5];
const player = new mm.Player();

class App extends Component {
  constructor() {
    super();

    this.fileInput = React.createRef();

    this.interval = null;

    var parent = this;
    this.playStopper = setInterval(
      function() {
        if(!player.isPlaying()) {
          parent.setState({lastPlayed: [-1, -1]});
        }
      }, 1000
    )

    this.state = {
      lastPlayed: [-1, -1],
      samples: [[null]],
      selected: [[false]],
      rows: [0],
      currentlySelected: [],
      mixDict: {},
      highlight: [[-1, -1], [-1, -1]],
      mixIndex: 4
    };
  }

  play(row, col) {
    if(player.isPlaying()) {
      player.stop();
    }
    if(this.state.lastPlayed[0] === row && this.state.lastPlayed[1] === col) {
      this.setState({lastPlayed: [-1, -1]});
      return;
    }
    this.setState({lastPlayed: [row, col]});
    player.start(this.state.samples[row][col]);
  }

  hover(row, col) {
    var qey = [row, col];
    if(qey in this.state.mixDict) {
      this.setState({highlight: this.state.mixDict[qey]});
    }
    else {
      this.setState({highlight: [[-1, -1], [-1, -1]]});
    }
  }

  sliderHover(i) {
    if(this.state.currentlySelected.length <= i) {
      return;
    }
    this.setState({highlight: [[this.state.currentlySelected[i][0], this.state.currentlySelected[i][1]], [-1, -1]]});
  }

  unhover() {
    this.setState({highlight: [[-1, -1], [-1, -1]]});
  }

  download(row, col) {
    saveAs(new File([mm.sequenceProtoToMidi(this.state.samples[row][col])], 'savedSample.mid'));
  }

  upload(row, col) {
    if(this.interval) {
      clearInterval(this.interval);
    }

    var reader = new FileReader();

    reader.onerror = e => {
      alert('Error in inputting file, I dont know what happened :(');
    }

    reader.onload = e => {
      try {
        var seq = mm.midiToSequenceProto(reader.result);

        var quantized_seq = mm.sequences.quantizeNoteSequence(seq, 4);

        var tmpSamples = this.state.samples;
        var tmpSelected = this.state.selected;
        var tmpRows = this.state.rows;
        tmpSamples[row][col] = quantized_seq;
        if(tmpSamples[tmpSamples.length - 1].length < 6) {
          tmpSamples[tmpSamples.length - 1].push(null);
          tmpSelected[tmpSelected.length - 1].push(false);
        }
        else {
          tmpSamples.push([null]);
          tmpSelected.push([false]);
          tmpRows.push(tmpRows.length);
        }
        this.setState({samples: tmpSamples, selected: tmpSelected, rows: tmpRows});
      } catch(e) {
        alert('Unable to parse MIDI file, sorry :(');
        return;
      }
    }

    this.fileInput.current.click();

    var parent = this;
    this.interval = setInterval(
      function() {
        if(parent.fileInput.current.value.length !== 0) {
          reader.readAsBinaryString(parent.fileInput.current.files[0]);
          parent.fileInput.current.value = null;
          clearInterval(parent.interval);
        }
      }, 500
    )
  }

  select(row, col) {
    if(!this.state.selected[row][col] && this.state.currentlySelected.length >= 2) {
      return;
    }
    var tmpSelected = this.state.selected;
    var tmpCurrentlySelected = this.state.currentlySelected;
    tmpSelected[row][col] = !tmpSelected[row][col];
    if(tmpSelected[row][col]) {
      tmpCurrentlySelected.push([row, col]);
    }
    else {
      tmpCurrentlySelected = tmpCurrentlySelected.filter(([x, y]) => x !== row || y !== col);
    }
    this.setState({selected: tmpSelected, currentlySelected: tmpCurrentlySelected});
  }

  slideEvent(event) {
    this.setState({mixIndex: event.target.value});
  }

  generate(row, col) {
    if(player.isPlaying()) {
      player.stop();
      this.setState({lastPlayed: [-1, -1]});
    }

    mvae.sample(1)
        .then((genSamples) => {
          var tmpSamples = this.state.samples;
          var tmpSelected = this.state.selected;
          var tmpRows = this.state.rows;
          var sampleNumber = 1 + row * 6 + col;
          tmpSamples[row][col] = genSamples[0];
          if(tmpSamples[tmpSamples.length - 1].length < 6) {
            tmpSamples[tmpSamples.length - 1].push(null);
            tmpSelected[tmpSelected.length - 1].push(false);
          }
          else {
            tmpSamples.push([null]);
            tmpSelected.push([null]);
            tmpRows.push(tmpRows.length);
          }
          NotificationManager.success('', 'Tune ' + sampleNumber.toString() + ' has been generated', 7000);
          this.setState({samples: tmpSamples, selected: tmpSelected, rows: tmpRows});
        });
  }

  mix() {
    var tmp = this.state.currentlySelected;

    if(tmp.length !== 2) {
      alert("Please, select 2 samples");
      return;
    }

    if(player.isPlaying()) {
      player.stop();
      this.setState({lastPlayed: [-1, -1]});
    }

    var input = [this.state.samples[tmp[0][0]][tmp[0][1]], this.state.samples[tmp[1][0]][tmp[1][1]]];

    mvae.interpolate(input, 9)
        .then((genSamples) => {
          var tmpSamples = this.state.samples;
          var tmpSelected = this.state.selected;
          var tmpRows = this.state.rows;
          var tmpMixDict = this.state.mixDict;
          var lastRow = tmpSamples.length - 1;
          var lastCol = tmpSamples[lastRow].length - 1;
          var sampleNumber = 1 + lastRow * 6 + lastCol;
          var qey = [lastRow, lastCol];
          tmpSamples[lastRow][lastCol] = genSamples[this.state.mixIndex];
          tmpMixDict[qey] = tmp;
          if(tmpSamples[tmpSamples.length - 1].length < 6) {
            tmpSamples[tmpSamples.length - 1].push(null);
            tmpSelected[tmpSelected.length - 1].push(false);
          }
          else {
            tmpSamples.push([null]);
            tmpSelected.push([null]);
            tmpRows.push(tmpRows.length);
          }
          NotificationManager.success('', 'Tune ' + sampleNumber.toString() + ' has been mixed', 7000);
          this.setState({samples: tmpSamples, selected: tmpSelected, rows: tmpRows, mixDict: tmpMixDict});
        });
  }

  render() {
    return (
      <div className="App">
        <div className="App-header">
          <input type="file" accept="audio/midi" ref={this.fileInput} />
          <NotificationContainer />
          <h1 className="App-header-title">Tune Mixer</h1>
          <p className="App-header-description">Tune Mixer is a tool for generating new tunes by mixing tunes. You can use Tune Mixer to explore different ways of combining tunes so as to create new tunes with new musical styles.</p>
          <p className="App-header-description">To use Tune Mixer, you first click “Generate” in the table to generate some new tunes and listen to them by clicking the “Play” buttons (i.e., the circles). After that, click “Select” to choose two tunes you like to mix.</p>
          <p className="App-header-description">You can use this slider to control the similarity between the new tune and the selected tunes. By default, Tune Mixer will inherit the musical styles of the selected tunes equally when generating the new tune, but you can use the slider to ask Tune Mixer to generate a new tune that is more similar to one of the selected tunes. Finally, click “Mix” and a new tune will be generated.</p>
          <p className="App-header-description">You can download the tunes as MIDI files and then upload the MIDI files to Tune Mixer in the future. Currently, Tune Mixer can only work with the MIDI files previously generated by Tune Mixer only---you cannot upload other MIDI files except those generated by Tune Mixer. But you can edit a MIDI file to modify the tune before uploading it. On <a className="App-link" href="https://onlinesequencer.net/import" target="_blank">this website</a> you can edit the MIDI files.</p>
        </div>
        <div className="App-body">
          <div>
            <div>
              <div className="App-body-slider">
                <div className="App-body-slider-textbox" onMouseOver={() => {this.sliderHover(0)}} onMouseLeave={() => {this.unhover()}}>
                  {this.state.currentlySelected.length <= 0 ?
                    ""
                    :
                    "Tune " + (1 + this.state.currentlySelected[0][0] * 6 + this.state.currentlySelected[0][1]).toString() 
                  }
                </div>
                <input type="range" min="0" max="8" disabled={this.state.currentlySelected.length !== 2} value={this.state.mixIndex} onChange={(e) => {this.slideEvent(e)}} />
                <div className="App-body-slider-textbox" onMouseOver={() => {this.sliderHover(1)}} onMouseLeave={() => {this.unhover()}}>
                  {this.state.currentlySelected.length <= 1 ?
                    ""
                    :
                    "Tune " + (1 + this.state.currentlySelected[1][0] * 6 + this.state.currentlySelected[1][1]).toString() 
                  }
                </div>
              </div>
              <div>
                <button className="App-button-mix" disabled={this.state.currentlySelected.length !== 2} type="button" onClick={() => {this.mix()}}>Mix</button>
              </div>
            </div>
          </div>
          <div>
            <table>
              {this.state.rows.map((row) =>
                <tr>
                  {numbers.map((col) => {
                    if(this.state.samples[row].length > col) {
                      return(
                        this.state.highlight[0][0] === row && this.state.highlight[0][1] === col || this.state.highlight[1][0] === row && this.state.highlight[1][1] === col ?
                          <th className="App-table-cell-highlighted" onMouseOver={() => {this.hover(row, col)}} onMouseLeave={() => {this.unhover()}}>
                            {!this.state.samples[row][col] ?
                              <div>
                                {row === 0 && col === 0 ?
                                  <button className="App-button-generate-glowing" type="button" onClick={() => {this.generate(row, col)}}>Generate</button>
                                  :
                                  <button className="App-button-generate" type="button" onClick={() => {this.generate(row, col)}}>Generate</button>
                                }
                                <button className="App-button-upload" type="button" onClick={() => {this.upload(row, col)}}>Upload</button>
                              </div>
                              :
                              <div>
                                {this.state.lastPlayed[0] === row && this.state.lastPlayed[1] === col ?
                                  <button className="App-button-play-active" type="button" onClick={() => {this.play(row, col)}}>
                                    <img src={ stopLogo } alt="Stop" align="center" />
                                  </button>
                                  :
                                  <button className="App-button-play-default" type="button" onClick={() => {this.play(row, col)}}>
                                    <img src={ playLogo } alt="Play" align="center" />
                                  </button>
                                }
                                {this.state.selected[row][col] ?
                                  <button className="App-button-select-active" type="button" onClick={() => {this.select(row, col)}}>Selected</button>
                                  :
                                  <button className="App-button-select-default" type="button" onClick={() => {this.select(row, col)}}>Select</button>
                                }
                                <button className="App-button-download" type="button" onClick={() => {this.download(row, col)}}>
                                  <img src={ downloadLogo } alt="Download" align="center" />
                                </button>
                                <div className="App-text-sample-number">{1 + row * 6 + col}</div>
                              </div>
                            }
                          </th>
                          :
                          <th className="App-table-cell-default" onMouseOver={() => {this.hover(row, col)}} onMouseLeave={() => {this.unhover()}}>
                            {!this.state.samples[row][col] ?
                              <div>
                                {row === 0 && col === 0 ?
                                  <button className="App-button-generate-glowing" type="button" onClick={() => {this.generate(row, col)}}>Generate</button>
                                  :
                                  <button className="App-button-generate" type="button" onClick={() => {this.generate(row, col)}}>Generate</button>
                                }
                                <button className="App-button-upload" type="button" onClick={() => {this.upload(row, col)}}>Upload</button>
                              </div>
                              :
                              <div>
                                {this.state.lastPlayed[0] === row && this.state.lastPlayed[1] === col ?
                                  <button className="App-button-play-active" type="button" onClick={() => {this.play(row, col)}}>
                                    <img src={ stopLogo } alt="Stop" align="center" />
                                  </button>
                                  :
                                  <button className="App-button-play-default" type="button" onClick={() => {this.play(row, col)}}>
                                    <img src={ playLogo } alt="Play" align="center" />
                                  </button>
                                }
                                {this.state.selected[row][col] ?
                                  <button className="App-button-select-active" type="button" onClick={() => {this.select(row, col)}}>Selected</button>
                                  :
                                  <button className="App-button-select-default" type="button" onClick={() => {this.select(row, col)}}>Select</button>
                                }
                                <button className="App-button-download" type="button" onClick={() => {this.download(row, col)}}>
                                  <img src={ downloadLogo } alt="Download" align="center" />
                                </button>
                                <div className="App-text-sample-number">{1 + row * 6 + col}</div>
                              </div>
                            }
                          </th>
                      );
                    }
                    else {
                      return '';
                    }
                  })}
                </tr>
              )}
            </table>
          </div>
        </div>
        <div className="App-footer">
          <p>Created by <a className="App-link" href="https://www.linkedin.com/in/teamskiy/" target="_blank">Temirlan Amangeldin</a> and <a className="App-link" href="https://ai.unist.ac.kr/~chiu/" target="_blank">Tsz-Chiu Au</a> using Google Magenta MusicVAE model and React framework</p>
        </div>
      </div>
    );
  }
}

export default App;
